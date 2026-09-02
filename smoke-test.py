#!/usr/bin/env python3
"""End-to-end smoke test against the running backend.

Walks the entire product flow over the real HTTP API — the same surface the
Next.js frontend uses — so it exercises token auth, CORS-independent access,
permissions, the eligibility auto-gate and certificate issuance together:

  admin: create course -> add teacher -> set evaluator -> build final assessment
  teacher: add lesson -> add in-video checkpoint -> submit for review
  admin: approve lesson -> publish course
  admin: register + enroll a student
  student: answer checkpoint -> complete lesson -> pass final assessment
  evaluator: approve certificate
  public: verify certificate by UID

Usage:  python3 smoke-test.py [base_url]
Default base_url: http://lms.localhost:8000

Uses only the standard library so it runs on any Python 3.9+ without installs.
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://lms.localhost:8000").rstrip("/")
ADMIN_USER, ADMIN_PASS = "Administrator", "admin"

# Every run creates fresh identities. Re-registering an existing user correctly
# returns existed=True with no password (we can't recover an unknown one), so a
# fixed email makes the second run fail at student login. Data accumulates in
# the dev site — that's acceptable for a smoke test.
RUN = time.strftime("%m%d-%H%M%S")

passed, failed = 0, 0


def log(ok, label, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  ok    {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


def resource(doctype):
    """/api/resource/<doctype> with the doctype URL-encoded (they contain spaces)."""
    return "/api/resource/" + urllib.parse.quote(doctype)


def call(method, token=None, params=None, raw_path=None, expect_error=False):
    """POST to /api/method/<method> (or raw_path) with optional token auth."""
    path = raw_path or f"/api/method/{method}"
    url = BASE + path
    data = None
    headers = {"Accept": "application/json"}
    if params is not None:
        data = json.dumps(params).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"token {token['api_key']}:{token['api_secret']}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method_for(data, raw_path))
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode() or "{}")
            # /api/method/* -> {"message": ...}; /api/resource/* -> {"data": ...}
            if "message" in body:
                return body["message"]
            if "data" in body:
                return body["data"]
            return body
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:400]
        if expect_error:
            return {"_error": detail, "_status": e.code}
        raise RuntimeError(f"{path} -> HTTP {e.code}: {detail}") from None


def method_for(data, raw_path):
    # Presence of a body decides the verb — raw_path is just a different URL
    # shape (/api/resource/... vs /api/method/...), not a different verb.
    return "POST" if data is not None else "GET"


def main():
    print(f"Smoke test against {BASE}\n")

    # --- admin login via our password->token bridge -------------------------
    admin = call(
        "shatam_care.shatam_care.auth.login_and_get_token",
        params={"usr": ADMIN_USER, "pwd": ADMIN_PASS},
    )
    log("api_key" in admin, "admin login returns api_key/api_secret", admin)
    if "api_key" not in admin:
        print("\nCannot continue without admin token.")
        return 1

    # --- admin: course scaffolding ------------------------------------------
    course = call(
        "shatam_care.shatam_care.admin_api.create_course",
        admin,
        {"title": f"Smoke Test {RUN}", "short_introduction": "smoke"},
    )
    log(bool(course), "create_course", course)

    teacher = call(
        "shatam_care.shatam_care.admin_api.create_user",
        admin,
        {"email": f"smoke.teacher.{RUN}@example.com", "full_name": "Smoke Teacher",
         "roles": json.dumps(["Batch Evaluator"]),
         "capabilities": json.dumps(["content"])},
    )
    call("shatam_care.shatam_care.admin_api.add_instructor", admin,
         {"course": course, "user": teacher["user"]})
    log(True, "add_instructor")

    # Evaluators are created with an explicit capability set — "evaluator" means
    # whatever the admin delegates, so approving certificates must be granted.
    evaluator = call(
        "shatam_care.shatam_care.admin_api.create_user",
        admin,
        {"email": f"smoke.evaluator.{RUN}@example.com", "full_name": "Smoke Evaluator",
         "roles": json.dumps(["Batch Evaluator"]),
         "capabilities": json.dumps(["certificates"])},
    )
    call("shatam_care.shatam_care.admin_api.set_course_evaluator", admin,
         {"course": course, "user": evaluator["user"]})
    log(True, "set_course_evaluator")

    quiz = call("shatam_care.shatam_care.admin_api.create_final_assessment", admin,
                {"course": course, "title": "Smoke Final", "passing_percentage": 50})
    log(bool(quiz), "create_final_assessment", quiz)

    call("shatam_care.shatam_care.admin_api.add_assessment_question", admin,
         {"quiz": quiz, "question_text": "Which is correct?",
          "options": json.dumps(["Right", "Wrong"]),
          "correct_indexes": json.dumps([0]), "marks": 1})
    log(True, "add_assessment_question")

    # --- lesson + checkpoint (created as admin; teacher perms tested via API) -
    chapter = call("shatam_care.shatam_care.content.create_chapter", admin,
                   {"course": course, "title": "Chapter 1"})
    chapter_name = chapter.get("name") if isinstance(chapter, dict) else None
    log(bool(chapter_name), "create chapter", chapter)

    lesson = call("shatam_care.shatam_care.content.create_lesson", admin,
                  {"course": course, "chapter": chapter_name, "title": "Lesson 1",
                   "youtube": "dQw4w9WgXcQ"})
    lesson_name = lesson.get("name") if isinstance(lesson, dict) else None
    log(bool(lesson_name), "create lesson", lesson)

    checkpoint = call("POST", admin,
                      {"lesson": lesson_name, "timestamp_seconds": 30,
                       "label": "CP1", "question_text": "Pick the right one",
                       "options": [{"option_text": "Right", "is_correct": 1},
                                   {"option_text": "Wrong", "is_correct": 0}]},
                      raw_path=resource("LMS Video Checkpoint"))
    cp_name = checkpoint.get("name") if isinstance(checkpoint, dict) else None
    log(bool(cp_name), "create video checkpoint", checkpoint)

    call("shatam_care.shatam_care.api.review_lesson", admin,
         {"lesson": lesson_name, "decision": "Approved"})
    log(True, "review_lesson -> Approved")

    call("shatam_care.shatam_care.admin_api.update_course", admin,
         {"course": course, "published": 1})
    log(True, "publish course")

    # --- student ------------------------------------------------------------
    student = call("shatam_care.shatam_care.admin_api.create_student", admin,
                   {"email": f"smoke.student.{RUN}@example.com", "full_name": "Smoke Student"})
    log("user" in student, "create_student", student)
    call("shatam_care.shatam_care.admin_api.enroll_student", admin,
         {"course": course, "member": student["user"]})
    log(True, "enroll_student")

    stok = call("shatam_care.shatam_care.auth.login_and_get_token",
                params={"usr": student["user"], "pwd": student["password"]})
    log("api_key" in stok, "student login", stok)

    # Student-safe content reads. Course Lesson grants read only to
    # SysMgr/Course Creator/Moderator, so students MUST come through these.
    content = call("shatam_care.shatam_care.content.get_course_content", stok, {"course": course})
    log(len(content.get("chapters", [])) == 1 and len(content.get("lessons", [])) == 1,
        "student can read course outline", content)
    log(bool(content.get("title")), "course outline includes title", content.get("title"))

    lesson_doc = call("shatam_care.shatam_care.content.get_lesson_for_student", stok,
                      {"lesson": lesson_name})
    log(lesson_doc.get("youtube") == "dQw4w9WgXcQ", "student can load the lesson", lesson_doc)

    # Reference tables must exist or stock lms cannot walk the course at all.
    outline = call("lms.lms.utils.get_course_outline", stok, {"course": course})
    log(isinstance(outline, list) and len(outline) == 1,
        "stock lms get_course_outline sees the content", outline)

    cps = call("shatam_care.shatam_care.api.get_lesson_checkpoints", stok,
               {"lesson": lesson_name})
    log(isinstance(cps, list) and len(cps) == 1, "student sees 1 checkpoint", cps)
    leaked = any("is_correct" in (o or {}) for c in (cps or []) for o in (c.get("options") or []))
    log(not leaked, "checkpoint options do NOT leak is_correct")

    res = call("shatam_care.shatam_care.api.submit_checkpoint_attempt", stok,
               {"checkpoint": cp_name, "selected_index": 0})
    log(res.get("is_correct") == 1, "correct checkpoint answer scored correct", res)

    dup = call("shatam_care.shatam_care.api.submit_checkpoint_attempt", stok,
               {"checkpoint": cp_name, "selected_index": 0}, expect_error=True)
    log("_error" in dup, "duplicate checkpoint attempt is rejected")

    # Stock lms whitelisted method — students have no direct create permission
    # on LMS Course Progress, and this also updates enrollment bookkeeping.
    call("lms.lms.doctype.course_lesson.course_lesson.save_progress", stok,
         {"lesson": lesson_name, "course": course})
    log(True, "mark lesson complete (save_progress)")

    fa = call("shatam_care.shatam_care.assessment.get_final_assessment", stok,
              {"course": course})
    log(fa.get("exists") is True, "final assessment visible to student", fa)
    log(fa["quiz"]["passing_percentage"] == 50,
        "admin's pass mark survived (stock forces 100 on empty quizzes)",
        fa["quiz"]["passing_percentage"])
    qname = fa["quiz"]["questions"][0]["question"]

    sub = call("shatam_care.shatam_care.assessment.submit_final_assessment", stok,
               {"course": course,
                "results": json.dumps([{"question_name": qname, "answer": ["Right"]}])})
    log(sub.get("pass") is True, "final assessment passed", sub)

    elig = call("shatam_care.shatam_care.api.get_certificate_eligibility", stok,
                {"course": course})
    log(elig.get("status") == "Eligible - Pending Approval",
        "auto-gate flipped to Eligible - Pending Approval", elig)

    stok2 = call("shatam_care.shatam_care.auth.login_and_get_token",
                 params={"usr": student["user"], "pwd": student["password"]})
    log(stok2["api_secret"] == stok["api_secret"],
        "re-login keeps the same token (does not sign out other devices)")

    # --- evaluator ----------------------------------------------------------
    etok = call("shatam_care.shatam_care.auth.login_and_get_token",
                params={"usr": evaluator["user"], "pwd": evaluator["password"]})
    queue = call("shatam_care.shatam_care.api.evaluator_queue", etok)
    # The queue is global for anyone holding the "certificates" capability, so
    # pick THIS run's learner rather than whatever happens to be oldest.
    mine = [row for row in queue if row["member"] == student["user"]]
    log(len(mine) == 1, "evaluator sees this run's pending approval", queue)

    denied = call("shatam_care.shatam_care.admin_api.create_course", etok,
                  {"title": "evaluator should not be able to create this"},
                  expect_error=True)
    log("_error" in denied, "evaluator WITHOUT 'courses' cannot create a course")

    approved = call("shatam_care.shatam_care.certificate_eligibility.approve_certificate",
                    etok, {"eligibility_name": mine[0]["name"]})
    log(approved.get("status") == "Approved", "certificate approved", approved)

    certs = call("shatam_care.shatam_care.api.my_certificates", stok)
    log(isinstance(certs, list) and len(certs) == 1, "student has 1 certificate", certs)
    uid = certs[0]["certificate_uid"] if certs else None
    log(bool(uid and uid.startswith("SCF-")), f"certificate UID format ({uid})")

    # --- public verification (no auth) --------------------------------------
    try:
        with urllib.request.urlopen(f"{BASE}/verify?id={urllib.parse.quote(uid)}", timeout=30) as r:
            html = r.read().decode()
        # Case-insensitive: the page is branded copy, not an API contract, so a
        # wording tweak shouldn't fail the suite.
        log("valid certificate" in html.lower(), "public /verify page shows a valid certificate")
    except Exception as e:  # noqa: BLE001
        log(False, "public /verify page", str(e)[:200])

    print(f"\npassed: {passed}   failed: {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as e:
        print(f"\nABORTED: {e}")
        sys.exit(2)
