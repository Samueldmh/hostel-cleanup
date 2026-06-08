import http.server
import json
import os
import random
import urllib.request
import urllib.error
from datetime import datetime, timedelta
import hashlib

def hash_password(password):
    if not password:
        return ""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def hash_answer(answer):
    if not answer:
        return ""
    return hashlib.sha256(answer.strip().lower().encode('utf-8')).hexdigest()

PORT = 3000
LOCAL_DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'db.json')
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')
CLOUD_DB_URL = os.environ.get("CLOUD_DB_URL")
MASTER_KEY = os.environ.get("MASTER_KEY")

if not CLOUD_DB_URL or not MASTER_KEY:
    print("==================================================", flush=True)
    print(" NOTICE: Cloud DB credentials not set in environment.", flush=True)
    print(" Running in LOCAL-ONLY mode (using local db.json).", flush=True)
    print("==================================================", flush=True)

def read_db():
    if not CLOUD_DB_URL or not MASTER_KEY:
        return read_local_db()
    # Try reading from JSONBin.io Cloud DB first
    try:
        req = urllib.request.Request(
            f"{CLOUD_DB_URL}/latest",
            headers={
                'X-Master-Key': MASTER_KEY,
                'X-Bin-Meta': 'false',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            method="GET"
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error reading from JSONBin.io: {e}. Falling back to local.", flush=True)
    
    return read_local_db()

def read_local_db():
    try:
        with open(LOCAL_DB_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print("Error reading local DB:", e)
        return {"members": [], "tasks": [], "history": []}

def write_db(data):
    # 1. Update local copy as backup
    try:
        os.makedirs(os.path.dirname(LOCAL_DB_PATH), exist_ok=True)
        temp_path = LOCAL_DB_PATH + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(temp_path, LOCAL_DB_PATH)
    except Exception as e:
        print("Error writing to local backup DB:", e)

    if not CLOUD_DB_URL or not MASTER_KEY:
        return True # Local write succeeded, cloud sync is bypassed

    # 2. Update JSONBin.io Cloud DB
    try:
        req = urllib.request.Request(
            CLOUD_DB_URL,
            data=json.dumps(data, ensure_ascii=False).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'X-Master-Key': MASTER_KEY,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            method="PUT"
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            response.read()
            return True
    except Exception as e:
        print("Error writing to JSONBin.io:", e)
        return False

def get_consecutive_gutter_count(reg, history):
    consecutive_gutter = 0
    for log in history:
        msg = log.get("message", "")
        # Look for allocation messages for this registration number
        if f"({reg})" in msg and "was randomly assigned to" in msg:
            if "the_gutter" in msg or "The gutter" in msg:
                consecutive_gutter += 1
            else:
                # Assigned to something else - streak broken!
                break
    return consecutive_gutter

class CustomHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silent logging to keep output clean, but can print if needed
        pass

    def end_headers(self):
        # Allow CORS for easy testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        # Serve API state
        if self.path == '/api/state':
            db = read_db()
            # Return clean members for display
            clean_members = [
                {
                    "reg": m["reg"],
                    "name": m["name"],
                    "gender": m["gender"],
                    "isAdmin": m.get("isAdmin", False),
                    "assignedLocationId": m.get("assignedLocationId")
                }
                for m in db["members"]
            ]
            response = {
                "success": True,
                "tasks": db["tasks"],
                "members": clean_members,
                "history": db.get("history", []),
                "settings": db.get("settings", {"nextCleanupDate": "2026-06-13T07:00:00", "bypassTimeRestriction": True})
            }
            self.send_json_response(200, response)
            return

        # Serve static files
        clean_path = self.path.split('?')[0]
        if clean_path == '/':
            clean_path = '/index.html'

        file_path = os.path.join(PUBLIC_DIR, clean_path.lstrip('/'))
        
        # Security check: prevent directory traversal
        if not os.path.abspath(file_path).startswith(os.path.abspath(PUBLIC_DIR)):
            self.send_error(403, "Access Denied")
            return

        if os.path.exists(file_path) and os.path.isfile(file_path):
            content_type = 'text/html'
            if file_path.endswith('.css'):
                content_type = 'text/css'
            elif file_path.endswith('.js'):
                content_type = 'application/javascript'
            elif file_path.endswith('.png'):
                content_type = 'image/png'
            elif file_path.endswith('.jpg') or file_path.endswith('.jpeg'):
                content_type = 'image/jpeg'

            self.send_response(200)
            self.send_header('Content-type', content_type)
            self.end_headers()
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404, "File Not Found")

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            req_body = json.loads(post_data.decode('utf-8'))
        except Exception:
            self.send_json_response(400, {"success": False, "message": "Invalid JSON payload"})
            return

        # 1. Login Endpoint
        if self.path == '/api/login':
            reg = req_body.get('reg')
            password = req_body.get('password')
            if not reg:
                self.send_json_response(400, {"success": False, "message": "Registration number is required!"})
                return
            
            db = read_db()
            clean_reg = reg.strip().lower()
            member = next((m for m in db["members"] if m["reg"].lower() == clean_reg), None)
            
            if not member:
                self.send_json_response(404, {"success": False, "message": "Registration number not found!"})
                return
            
            # Two-stage login check
            if password is None:
                if not member.get("password"):
                    self.send_json_response(200, {
                        "success": True,
                        "requiresSetup": True,
                        "member": {"reg": member["reg"], "name": member["name"]}
                    })
                    return
                else:
                    self.send_json_response(200, {
                        "success": True,
                        "requiresPassword": True,
                        "member": {"reg": member["reg"], "name": member["name"]}
                    })
                    return

            # Password verification stage
            if not member.get("password"):
                self.send_json_response(400, {"success": False, "message": "Password is not set up yet for this account!"})
                return

            hashed_input = hash_password(password)
            if member["password"] != hashed_input:
                self.send_json_response(401, {"success": False, "message": "Incorrect password!"})
                return
            
            self.send_json_response(200, {
                "success": True,
                "member": {
                    "reg": member["reg"],
                    "name": member["name"],
                    "gender": member["gender"],
                    "isAdmin": member.get("isAdmin", False),
                    "assignedLocationId": member.get("assignedLocationId")
                }
            })

        # 1.1 First-time Security Setup Endpoint
        elif self.path == '/api/setup-security':
            reg = req_body.get('reg')
            password = req_body.get('password')
            security_question = req_body.get('securityQuestion')
            security_answer = req_body.get('securityAnswer')

            if not reg or not password or not security_question or not security_answer:
                self.send_json_response(400, {"success": False, "message": "Missing required fields for setup!"})
                return

            db = read_db()
            clean_reg = reg.strip().lower()
            member = next((m for m in db["members"] if m["reg"].lower() == clean_reg), None)

            if not member:
                self.send_json_response(404, {"success": False, "message": "User not found!"})
                return

            if member.get("password"):
                self.send_json_response(400, {"success": False, "message": "Password has already been set up for this account!"})
                return

            # Save hashed credentials
            member["password"] = hash_password(password)
            member["securityQuestion"] = security_question.strip()
            member["securityAnswer"] = hash_answer(security_answer)

            if write_db(db):
                self.send_json_response(200, {
                    "success": True, 
                    "message": "Security setup completed successfully!",
                    "member": {
                        "reg": member["reg"],
                        "name": member["name"],
                        "gender": member["gender"],
                        "isAdmin": member.get("isAdmin", False),
                        "assignedLocationId": member.get("assignedLocationId")
                    }
                })
            else:
                self.send_json_response(500, {"success": False, "message": "Error saving setup details to database!"})

        # 1.2 Get Security Question Endpoint
        elif self.path == '/api/get-security-question':
            reg = req_body.get('reg')
            if not reg:
                self.send_json_response(400, {"success": False, "message": "Registration number is required!"})
                return

            db = read_db()
            clean_reg = reg.strip().lower()
            member = next((m for m in db["members"] if m["reg"].lower() == clean_reg), None)

            if not member:
                self.send_json_response(404, {"success": False, "message": "Registration number not found!"})
                return

            if not member.get("securityQuestion"):
                self.send_json_response(400, {"success": False, "message": "No security question set up for this account. Please contact the Admin."})
                return

            self.send_json_response(200, {"success": True, "question": member["securityQuestion"]})

        # 1.3 Reset Password Endpoint
        elif self.path == '/api/reset-password':
            reg = req_body.get('reg')
            security_answer = req_body.get('securityAnswer')
            new_password = req_body.get('newPassword')

            if not reg or not security_answer or not new_password:
                self.send_json_response(400, {"success": False, "message": "Missing parameters!"})
                return

            db = read_db()
            clean_reg = reg.strip().lower()
            member = next((m for m in db["members"] if m["reg"].lower() == clean_reg), None)

            if not member:
                self.send_json_response(404, {"success": False, "message": "User not found!"})
                return

            if not member.get("securityAnswer"):
                self.send_json_response(400, {"success": False, "message": "Security question not set up for this account!"})
                return

            hashed_answer_input = hash_answer(security_answer)
            if member["securityAnswer"] != hashed_answer_input:
                self.send_json_response(401, {"success": False, "message": "Incorrect answer to the security question!"})
                return

            # Update password
            member["password"] = hash_password(new_password)

            # Log action
            db.setdefault("history", []).insert(0, {
                "timestamp": datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p"),
                "message": f"{member['name']} ({member['reg']}) reset their password using their security question."
            })

            if write_db(db):
                self.send_json_response(200, {
                    "success": True, 
                    "message": "Password reset successful!",
                    "member": {
                        "reg": member["reg"],
                        "name": member["name"],
                        "gender": member["gender"],
                        "isAdmin": member.get("isAdmin", False),
                        "assignedLocationId": member.get("assignedLocationId")
                    }
                })
            else:
                self.send_json_response(500, {"success": False, "message": "Error saving new password to database!"})

        # 2. Allocation Endpoint (FCFS & Passcode Verified)
        elif self.path == '/api/allocate':
            reg = req_body.get('reg')
            passcode = req_body.get('passcode')
            if not reg:
                self.send_json_response(400, {"success": False, "message": "Registration number is required!"})
                return

            db = read_db()
            clean_reg = reg.strip().lower()
            member = next((m for m in db["members"] if m["reg"].lower() == clean_reg), None)

            if not member:
                self.send_json_response(404, {"success": False, "message": "User not found!"})
                return

            if member.get("isAdmin", False):
                self.send_json_response(400, {"success": False, "message": "Administrators are exempt from cleanup duties!"})
                return

            if member.get("assignedLocationId"):
                existing = next((t for t in db["tasks"] if t["id"] == member["assignedLocationId"]), None)
                msg = f"You are already assigned to \"{existing['name'] if existing else 'a spot'}\"!"
                self.send_json_response(400, {"success": False, "message": msg})
                return

            # Saturday 7:00 AM Time-restriction check
            settings = db.get("settings", {})
            if not settings.get("bypassTimeRestriction", False):
                next_date_str = settings.get("nextCleanupDate", "2026-06-13T07:00:00")
                try:
                    next_date = datetime.fromisoformat(next_date_str)
                except ValueError:
                    next_date = datetime(2026, 6, 13, 7, 0, 0)
                
                if datetime.now() < next_date:
                    formatted_date = next_date.strftime("%A, %B %d, %Y at %I:%M %p")
                    self.send_json_response(400, {
                        "success": False, 
                        "message": f"Allocations open on {formatted_date}!"
                    })
                    return

            # Passcode verification
            expected_passcode = settings.get("assemblyPasscode", "1234")
            if not passcode or passcode.strip() != expected_passcode.strip():
                self.send_json_response(400, {"success": False, "message": "Invalid assembly passcode! Please get the code from the Admin at the assembly point."})
                return

            # Find available tasks (slots count < capacity)
            available = [t for t in db["tasks"] if len(t.get("assignedTo", [])) < t["capacity"]]

            # Apply consecutive gutter constraint (no member assigned to gutter 3 times in a row)
            consec_gutter = get_consecutive_gutter_count(member["reg"], db.get("history", []))
            if consec_gutter >= 2:
                available = [t for t in available if t["id"] != "the_gutter"]

            if not available:
                self.send_json_response(400, {"success": False, "message": "No available free cleanup spots left! Contact Admin."})
                return

            # FCFS matching: Select tasks from the lowest available difficulty level
            min_difficulty = min(t.get("difficulty", 2) for t in available)
            available = [t for t in available if t.get("difficulty", 2) == min_difficulty]

            # Randomly select task from easiest subset
            selected = random.choice(available)
            selected.setdefault("assignedTo", []).append({
                "reg": member["reg"],
                "name": member["name"]
            })
            member["assignedLocationId"] = selected["id"]

            # Log
            log_msg = f"{member['name']} ({member['reg']}) was randomly assigned to \"{selected['name']}\""
            db.setdefault("history", []).insert(0, {
                "timestamp": datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p"),
                "message": log_msg
            })

            if write_db(db):
                self.send_json_response(200, {"success": True, "task": selected, "log": log_msg})
            else:
                self.send_json_response(500, {"success": False, "message": "Error writing to database!"})

        # 3. Image Upload Endpoint
        elif self.path == '/api/upload-image':
            admin_reg = req_body.get('adminReg')
            task_id = req_body.get('taskId')
            image = req_body.get('image')

            if not admin_reg or not task_id or not image:
                self.send_json_response(400, {"success": False, "message": "Missing parameters!"})
                return

            db = read_db()
            admin = next((m for m in db["members"] if m["reg"].lower() == admin_reg.strip().lower()), None)

            if not admin or not admin.get("isAdmin", False):
                self.send_json_response(403, {"success": False, "message": "Access Denied: Only administrators can upload pictures!"})
                return

            task = next((t for t in db["tasks"] if t["id"] == task_id), None)
            if not task:
                self.send_json_response(404, {"success": False, "message": "Location not found!"})
                return

            task["image"] = image
            
            # Log
            log_msg = f"Admin {admin['name']} updated the picture for \"{task['name']}\""
            db.setdefault("history", []).insert(0, {
                "timestamp": datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p"),
                "message": log_msg
            })

            if write_db(db):
                self.send_json_response(200, {"success": True, "message": "Location photo successfully updated!"})
            else:
                self.send_json_response(500, {"success": False, "message": "Error saving photo to database!"})

        # 4. Weekly Reset Endpoint
        elif self.path == '/api/reset':
            admin_reg = req_body.get('adminReg')
            if not admin_reg:
                self.send_json_response(400, {"success": False, "message": "Admin registration number required!"})
                return

            db = read_db()
            admin = next((m for m in db["members"] if m["reg"].lower() == admin_reg.strip().lower()), None)

            if not admin or not admin.get("isAdmin", False):
                self.send_json_response(403, {"success": False, "message": "Access Denied: Only administrators can reset allocations!"})
                return

            for m in db["members"]:
                m["assignedLocationId"] = None

            for t in db["tasks"]:
                t["assignedTo"] = []
                t["completedBy"] = []

            # Automatically roll nextCleanupDate forward by 14 days (2 weeks) only if it has already passed
            settings = db.setdefault("settings", {})
            current_date_str = settings.get("nextCleanupDate", "2026-06-13T07:00:00")
            try:
                next_date = datetime.fromisoformat(current_date_str)
            except ValueError:
                next_date = datetime(2026, 6, 13, 7, 0, 0)
            
            # Roll forward by 14 days only if current time is equal to or after the target date
            rolled_forward = False
            while next_date <= datetime.now():
                next_date += timedelta(days=14)
                rolled_forward = True
                
            settings["nextCleanupDate"] = next_date.isoformat()

            # Log
            if rolled_forward:
                log_msg = f"Admin {admin['name']} reset Saturday allocations. Next cleanup rolled forward to {next_date.strftime('%A, %B %d, %Y')}."
            else:
                log_msg = f"Admin {admin['name']} reset Saturday allocations (schedule kept at {next_date.strftime('%A, %B %d, %Y')})."
                
            db.setdefault("history", []).insert(0, {
                "timestamp": datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p"),
                "message": log_msg
            })

            if write_db(db):
                if rolled_forward:
                    msg = f"Allocations reset! Next cleanup rolled forward to {next_date.strftime('%B %d, %Y')}."
                else:
                    msg = f"Allocations reset! Schedule remains set for {next_date.strftime('%B %d, %Y')}."
                self.send_json_response(200, {
                    "success": True, 
                    "message": msg,
                    "nextCleanupDate": settings["nextCleanupDate"]
                })
            else:
                self.send_json_response(500, {"success": False, "message": "Error resetting allocations!"})

        # 5. Task Completion Endpoint (Admin-only Trigger)
        elif self.path == '/api/complete-task':
            admin_reg = req_body.get('adminReg')
            student_reg = req_body.get('studentReg')

            if not admin_reg or not student_reg:
                self.send_json_response(400, {"success": False, "message": "Missing parameters adminReg or studentReg!"})
                return

            db = read_db()
            admin = next((m for m in db["members"] if m["reg"].lower() == admin_reg.strip().lower()), None)
            if not admin or not admin.get("isAdmin", False):
                self.send_json_response(403, {"success": False, "message": "Access Denied: Only administrators can mark tasks as completed!"})
                return

            student = next((m for m in db["members"] if m["reg"].lower() == student_reg.strip().lower()), None)
            if not student:
                self.send_json_response(404, {"success": False, "message": "Student not found in hostel database!"})
                return

            task_id = student.get("assignedLocationId")
            if not task_id:
                self.send_json_response(400, {"success": False, "message": "Student has not been assigned to any location!"})
                return

            task = next((t for t in db["tasks"] if t["id"] == task_id), None)
            if not task:
                self.send_json_response(404, {"success": False, "message": "Assigned location not found!"})
                return

            completed_by = task.setdefault("completedBy", [])
            if student["reg"] not in completed_by:
                completed_by.append(student["reg"])
                
                # Log
                log_msg = f"Admin {admin['name']} marked {student['name']}'s task at \"{task['name']}\" as completed!"
                db.setdefault("history", []).insert(0, {
                    "timestamp": datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p"),
                    "message": log_msg
                })

            if write_db(db):
                self.send_json_response(200, {"success": True, "message": f"Successfully marked {student['name']}'s task as completed!"})
            else:
                self.send_json_response(500, {"success": False, "message": "Error writing to database!"})

        # 6. Admin Update Settings Endpoint
        elif self.path == '/api/update-settings':
            admin_reg = req_body.get('adminReg')
            bypass = req_body.get('bypassTimeRestriction')
            next_date_str = req_body.get('nextCleanupDate')
            assembly_passcode = req_body.get('assemblyPasscode')
            
            if not admin_reg:
                self.send_json_response(400, {"success": False, "message": "Admin registration is required!"})
                return
                
            db = read_db()
            admin = next((m for m in db["members"] if m["reg"].lower() == admin_reg.strip().lower()), None)
            
            if not admin or not admin.get("isAdmin", False):
                self.send_json_response(403, {"success": False, "message": "Access Denied: Only administrators can update settings!"})
                return
                
            settings = db.setdefault("settings", {})
            if bypass is not None:
                settings["bypassTimeRestriction"] = bool(bypass)
            if next_date_str:
                try:
                    datetime.fromisoformat(next_date_str)
                    settings["nextCleanupDate"] = next_date_str
                except ValueError:
                    self.send_json_response(400, {"success": False, "message": "Invalid date format! Use YYYY-MM-DDTHH:MM:SS"})
                    return
            if assembly_passcode is not None:
                settings["assemblyPasscode"] = str(assembly_passcode).strip()
                    
            # Log
            log_msg = f"Admin {admin['name']} updated settings: next cleanup set to {settings.get('nextCleanupDate')}, bypass={settings.get('bypassTimeRestriction')}, passcode={settings.get('assemblyPasscode')}"
            db.setdefault("history", []).insert(0, {
                "timestamp": datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p"),
                "message": log_msg
            })
            
            if write_db(db):
                self.send_json_response(200, {"success": True, "message": "Hostel cleanup settings updated successfully!", "settings": settings})
            else:
                self.send_json_response(500, {"success": False, "message": "Error saving settings!"})

    def send_json_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

def run():
    server_address = ('', PORT)
    httpd = http.server.HTTPServer(server_address, CustomHandler)
    print(f"==================================================")
    print(f" HOSTEL CLEANUP SYSTEM PYTHON SERVER RUNNING")
    print(f" Local Web Server: http://localhost:{PORT}")
    print(f" Database Path: {LOCAL_DB_PATH}")
    print(f" Cloud Database: {CLOUD_DB_URL}")
    print(f"==================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    run()
