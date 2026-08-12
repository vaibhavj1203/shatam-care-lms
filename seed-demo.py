#!/usr/bin/env python3
"""Seed a clean demo scenario for the manual UI walkthrough (see test-steps.txt).

Creates four logins with known passwords, a published course whose lesson has an
in-video checkpoint at 5 seconds, and a one-question final assessment.

Safe to re-run: existing users are reused and their passwords reset, so the
credentials printed at the end always work. Each run makes a *fresh* course, so
the student starts with nothing completed.

    python3 seed-demo.py [base_url]      # default http://localhost:8000
"""

import json
import sys
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")

# Frappe enforces password strength — short or common passwords are rejected.
#
# Three personas. An evaluator holds only the capabilities the admin delegates,
# so two are seeded to show both ends of that range: one who only signs off
# certificates, and one trusted with content and course setup as well.
# Staff never get "LMS Student" — that would hand them the learner navigation
# (catalogue, enrolment, certificates) on top of their own tools.
ACCOUNTS = [
    ("student", "demo.student@example.com", "Kestrel-Bamboo-42", "Demo Student",
     ["LMS Student"], []),
    ("evaluator", "demo.evaluator@example.com", "Evaluator-Bamboo-42", "Demo Evaluator",
     ["Batch Evaluator"], ["certificates"]),
    ("coordinator", "demo.coordinator@example.com", "Coord-Bamboo-42", "Demo Coordinator",
     ["Batch Evaluator"], ["courses", "content", "review", "certificates", "people"]),
]
COURSE_TITLE = "Demo: Safe Patient Handling"


def api(path, token=None, params=None, method=None):
    data = json.dumps(params).encode() if params is not None else None
    headers = {"Accept": "application/json"}
    if data:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"token {token['api_key']}:{token['api_secret']}"
    req = urllib.request.Request(
        BASE + path, data=data, headers=headers, method=method or ("POST" if data else "GET")
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.loads(r.read().decode() or "{}")
    return body.get("message", body.get("data", body))


def call(method_path, token=None, params=None):
    return api(f"/api/method/{method_path}", token, params)


def resource(doctype, token, params):
    return api("/api/resource/" + urllib.parse.quote(doctype), token, params)


admin = call("shatam_care.shatam_care.auth.login_and_get_token",
             params={"usr": "Administrator", "pwd": "admin"})

# --- accounts -----------------------------------------------------------------
users = {}
for role, email, password, full_name, roles, caps in ACCOUNTS:
    created = call("shatam_care.shatam_care.admin_api.create_user", admin,
                   {"email": email, "full_name": full_name,
                    "roles": json.dumps(roles), "capabilities": json.dumps(caps),
                    "password": password,
                    # The API now refuses duplicate emails so admins can't
                    # silently overwrite an account from the UI. The seeder
                    # genuinely means "reset these demo accounts", so opts in.
                    "update_if_exists": True})
    users[role] = created["user"]
    if created.get("existed"):
        # Re-run: we can't recover the old password, so set the documented one.
        # Roles are re-applied by create_user, which also strips any stale ones.
        call("shatam_care.shatam_care.admin_api.reset_password", admin,
             {"user": email, "password": password})

# --- course, taught by the teacher, signed off by the evaluator ----------------
course = call("shatam_care.shatam_care.admin_api.create_course", admin,
              {"title": COURSE_TITLE,
               "short_introduction": "Demo course for the manual UI walkthrough"})

# No named Course Evaluator is required any more: anyone with the
# "certificates" capability can approve, so a course can't strand its learners
# by simply not having one assigned.
call("shatam_care.shatam_care.admin_api.set_course_evaluator", admin,
     {"course": course, "user": users["evaluator"]})

chapter = call("shatam_care.shatam_care.content.create_chapter", admin,
               {"course": course, "title": "Module 1 — Foundations"})["name"]

lesson = call("shatam_care.shatam_care.content.create_lesson", admin,
              {"course": course, "chapter": chapter,
               "title": "Lifting a patient safely", "youtube": "dQw4w9WgXcQ"})["name"]

# 5 seconds in, so the overlay fires almost immediately during the walkthrough.
resource("LMS Video Checkpoint", admin, {
    "lesson": lesson,
    "timestamp_seconds": 5,
    "label": "Early check",
    "question_text": "When lifting a patient, what should you bend?",
    "options": [
        {"option_text": "Your knees", "is_correct": 1},
        {"option_text": "Your back", "is_correct": 0},
    ],
})

call("shatam_care.shatam_care.api.review_lesson", admin,
     {"lesson": lesson, "decision": "Approved"})

quiz = call("shatam_care.shatam_care.admin_api.create_final_assessment", admin,
            {"course": course, "title": "Safe Handling — Final", "passing_percentage": 50})
call("shatam_care.shatam_care.admin_api.add_assessment_question", admin,
     {"quiz": quiz,
      "question_text": "Safe lifting technique mainly protects which part of the body?",
      "options": json.dumps(["Your back", "Your hearing"]),
      "correct_indexes": json.dumps([0]),
      "marks": 1})

call("shatam_care.shatam_care.admin_api.update_course", admin,
     {"course": course, "published": 1})
call("shatam_care.shatam_care.admin_api.enroll_student", admin,
     {"course": course, "member": users["student"]})

print("\nDemo scenario ready — see test-steps.txt\n")
print(f"  course : {COURSE_TITLE}")
print(f"  lesson : {lesson}  (checkpoint at 0:05)")
print("\n  logins:")
print(f"    {'admin':<10} {'Administrator':<30} / admin")
for role, email, password, _, roles, caps in ACCOUNTS:
    can = ", ".join(caps) if caps else "(learner)"
    print(f"    {role:<12} {email:<32} / {password:<20} can: {can}")
print()
