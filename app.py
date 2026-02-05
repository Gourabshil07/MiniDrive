from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import boto3
import json
import mimetypes
from flask import session
import secrets
import re
import os

app = Flask(__name__)

app.secret_key = os.environ.get("FLASK_SECRET_KEY", "CHANGE_ME_IN_PROD")  


@app.before_request
def validate_logged_in_user():

    # allow public routes
    if request.endpoint and request.endpoint in ("login", "signup", "static", "check_username"):
        return None

    if "user" not in session:
        return redirect(url_for("login"))

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        "SELECT id FROM users WHERE username=?",
        (session["user"],)
    )

    user = cursor.fetchone()
    db.close()

    if not user:
        session.clear()
        return redirect(url_for("login"))


    # User deleted but session exists
    if not user:

        session.clear()   

        return redirect(url_for("login"))


# S3 CONFIG 
BUCKET_NAME = "gourab-gdrive"
REGION = "ap-south-1"

s3 = boto3.client("s3", region_name=REGION)

#  DATABASE 
DB_FILE = "database.db"


def get_db():
    return sqlite3.connect(DB_FILE)


#INIT DRIVE TABLE 

def init_drive():

    db = get_db()
    c = db.cursor()

    # USERS
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user'
        )
    """)

    # DRIVE (per user)
    c.execute("""
        CREATE TABLE IF NOT EXISTS drive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            data TEXT
        )
    """)

    db.commit()
    db.close()



init_drive()


def load_data():

    username = session.get("user")

    db = get_db()
    c = db.cursor()

    row = c.execute(
        "SELECT data FROM drive WHERE username=?",
        (username,)
    ).fetchone()

    #  Auto create drive if missing
    if not row:

        empty_drive = {
            "root": {},
            "trash": {},
            "recent": []
        }

        c.execute(
            "INSERT INTO drive (username, data) VALUES (?, ?)",
            (username, json.dumps(empty_drive))
        )

        db.commit()
        db.close()

        return empty_drive

    db.close()

    return json.loads(row[0])


def save_data(data):

    username = session.get("user")

    db = get_db()
    c = db.cursor()

    c.execute(
        "UPDATE drive SET data=? WHERE username=?",
        (json.dumps(data), username)
    )

    db.commit()
    db.close()

#Add helper functions for validation

def update_drive_key(data, old_key, new_key):
    def recurse(folder):
        for k in list(folder.keys()):
            if k == old_key:
                folder[new_key] = folder.pop(k)
                return True
            if isinstance(folder[k], dict):
                if recurse(folder[k]):
                    return True
        return False

    recurse(data["root"])



#username validation function
def validate_username(username):
    # length: min 3, max 12
    if not 3 <= len(username) <= 12:
        return "Username must be between 3 and 12 characters."

    # allowed characters only (no spaces)
    if not re.fullmatch(r"[A-Za-z0-9@#&]+", username):
        return "Only letters, numbers and @ # & are allowed."

    # only one special character allowed
    specials = re.findall(r"[@#&]", username)
    if len(specials) > 1:
        return "Only one special character (@, #, &) is allowed."

    return None



#password validation function

def validate_password(password):
    if len(password) < 4:
        return "Password must be at least 4 characters long."

    if not re.search(r"[A-Za-z]", password):
        return "Password must contain at least one letter."

    if not re.search(r"[0-9]", password):
        return "Password must contain at least one number."

    if not re.search(r"[@#&!$%^*]", password):
        return "Password must contain at least one special character."

    return None



# ROUTES 

@app.route("/")
def home():
    return redirect(url_for("login"))

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":

        db = None

        try:
            username = request.form.get("username", "").strip()
            password_raw = request.form.get("password", "")

            #  Validate username format
            username_error = validate_username(username)
            if username_error:
                flash(username_error, "signup_error")
                return redirect(url_for("signup"))

            #  Validate Password
            password_error = validate_password(password_raw)
            if password_error:
                flash(password_error, "signup_error")
                return redirect(url_for("signup"))

            db = get_db()
            cursor = db.cursor()

            # Check username exists
            cursor.execute(
                "SELECT 1 FROM users WHERE username = ?",
                (username,)
            )
            if cursor.fetchone():
                flash("Username already exists", "signup_error")
                return redirect(url_for("signup"))

            password = generate_password_hash(password_raw)

            cursor.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (username, password)
            )

            empty_drive = {
                "root": {},
                "trash": {},
                "recent": []
            }

            cursor.execute(
                "INSERT INTO drive (username, data) VALUES (?, ?)",
                (username, json.dumps(empty_drive))
            )

            db.commit()

            flash("Account created successfully. Please login.")
            return redirect(url_for("login"))

        except Exception as e:
            print("Signup error:", e)
            flash("Something went wrong. Please try again.")
            return redirect(url_for("signup"))

        finally:
            if db:
                db.close()

    return render_template("login.html")



#Login Route
@app.route("/login", methods=["GET", "POST"])
def login():

    if request.method == "POST":

        username = request.form["username"]
        password = request.form["password"]

        db = get_db()
        cursor = db.cursor()

        user = cursor.execute(
            "SELECT * FROM users WHERE username=?", (username,)
        ).fetchone()

        db.close()   

        if user and check_password_hash(user[2], password):

            session["user"] = user[1]
            session["role"] = user[3]     # role
            return redirect(url_for("dashboard"))

        else:
            flash("Invalid credentials")
            return redirect(url_for("login"))

    return render_template("login.html")

# LOGOUT ROUTE 
@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))


#check username
@app.route("/api/check-username")
def check_username():
    username = request.args.get("username", "").strip()

    if not username:
        return jsonify({"exists": False})

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        "SELECT 1 FROM users WHERE username = ?",
        (username,)
    )
    exists = cursor.fetchone() is not None

    db.close()

    return jsonify({"exists": exists})



# Dashboard route
@app.route("/dashboard")
def dashboard():

    if not session.get("user"):
        return redirect(url_for("login"))

    return render_template(
        "dashboard.html",
        username=session["user"]
    )


#admin dashboard route
def get_user_storage(username):

    total_bytes = 0

    paginator = s3.get_paginator('list_objects_v2')

    for page in paginator.paginate(
        Bucket=BUCKET_NAME,
        Prefix=f"{username}/"
    ):
        if "Contents" in page:
            for obj in page["Contents"]:
                total_bytes += obj["Size"]

    return round(total_bytes / (1024 * 1024), 2)



@app.route("/admin")
def admin_panel():

    if "user" not in session:
        return redirect(url_for("login"))

    if session.get("role") != "admin":
        return "Access Denied", 403

    db = get_db()
    cursor = db.cursor()   

    users_raw = cursor.execute(
        "SELECT id, username, role FROM users"
    ).fetchall()

    users = []

    for u in users_raw:
        storage = get_user_storage(u[1])

        users.append({
            "id": u[0],
            "username": u[1],
            "role": u[2],
            "storage": storage
        })

    db.close()

    return render_template("admin.html", users=users)

# delete user route
def delete_user_s3_folder(username):

    if not username:
        raise ValueError("Invalid username — refusing to delete.")


    paginator = s3.get_paginator("list_objects_v2")
    deleted = False

    for page in paginator.paginate(
        Bucket=BUCKET_NAME,
        Prefix=f"{username}/"
    ):

        if "Contents" in page:

            objects = [{"Key": obj["Key"]} for obj in page["Contents"]]

            s3.delete_objects(
                Bucket=BUCKET_NAME,
                Delete={"Objects": objects}
            )

            deleted = True

    return deleted


@app.route("/admin/delete-user/<username>", methods=["POST"])
def delete_user(username):

    if session.get("role") != "admin":
        return "Access Denied", 403

    if username == session["user"]:
        return "Admin cannot delete himself!"

    try:
        db = get_db()
        cursor = db.cursor()

        # confirm user exists
        cursor.execute("SELECT * FROM users WHERE username=?", (username,))
        user = cursor.fetchone()

        if not user:
            return "User not found", 404

        # Delete S3 first
        delete_user_s3_folder(username)

    
        cursor.execute("DELETE FROM users WHERE username=?", (username,))
        cursor.execute("DELETE FROM drive WHERE username=?", (username,))

        db.commit()

    except Exception as e:
        print("Delete error:", e)
        return "Failed to delete user", 500

    finally:
        db.close()

    return redirect(url_for("admin_panel"))




# Drive APi

@app.route("/api/drive", methods=["GET"])
def get_drive():

    if "user" not in session:
        return jsonify({"error":"unauthorized"}),401

    data = load_data()
    return jsonify(data)



@app.route("/api/drive", methods=["POST"])
def save_drive():

    if "user" not in session:
        return jsonify({"error":"unauthorized"}),401

    save_data(request.json)
    return jsonify({"status":"ok"})



#  create folder

@app.route("/api/create-folder", methods=["POST"])
def create_folder():

    info = request.get_json()

    if not info:
        return jsonify({"error": "No data"}), 400

    name = info.get("name")
    path = info.get("path")

    if not name or not path:
        return jsonify({"error": "Invalid data"}), 400


    data = load_data()

    # SAFE traversal
    ref = data["root"]

    for folder in path[1:]:
        if folder not in ref:
            ref[folder] = {}
        ref = ref[folder]


    if name in ref:
        return jsonify({"error": "exists"}), 400


    # store metadata
    from datetime import datetime

    ref[name] = {
        "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "owner": "Me"
    }

    # create S3 folder safely
    try:
        username = session["user"]

        s3_key = "/".join(
            [username] + path[1:] + [name]
        ) + "/"

        s3.put_object(Bucket=BUCKET_NAME, Key=s3_key)




    except Exception as e:
        print("S3 error:", e)
        return jsonify({"error": "S3 failed"}), 500


    save_data(data)

    return jsonify({"status": "created"})




# FILE UPLOAD WITH PATH SUPPORT

MINIDRIVE_LIMIT_MB = 3 * 1024   # 3 GB

def get_total_minidrive_storage():
    total_bytes = 0
    paginator = s3.get_paginator("list_objects_v2")

    for page in paginator.paginate(Bucket=BUCKET_NAME):
        if "Contents" in page:
            for obj in page["Contents"]:
                total_bytes += obj["Size"]

    return round(total_bytes / (1024 * 1024), 2)  # MB

@app.route("/api/upload", methods=["POST"])
def upload_file():
    file = request.files.get("file")
    path = json.loads(request.form.get("path"))

    if not file:
        return jsonify({"error": "no file"}), 400

    filename = secure_filename(file.filename)

    # Read file into memory
    file_bytes = file.read()
    size_mb = round(len(file_bytes) / (1024 * 1024), 2)

    #  Global Storage Limit Check
    total_used_mb = get_total_minidrive_storage()

    if total_used_mb + size_mb > MINIDRIVE_LIMIT_MB:
        return jsonify({
            "error": "MINIDRIVE_STORAGE_FULL",
            "message": "MiniDrive total storage limit (3GB) reached"
        }), 403
    

    # build S3 key
    username = session["user"]

    s3_key = "/".join(
        [username] + path[1:] + [filename]
    )

    # upload using bytes
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=s3_key,
        Body=file_bytes,
        ContentType=file.mimetype,
        ContentDisposition="inline"
    )

    url = f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{s3_key}"

    #save file info database structure
    data = load_data()

    ref = data["root"]
    for i in range(1, len(path)):
        folder = path[i]
        if folder not in ref:
           ref[folder] = {
               "created": None,
               "owner": "Me"
           }
        ref = ref[folder]    

    ref[filename] = {
        "size": size_mb,
        "url": url,
        "type": file.mimetype
    }

    save_data(data)

    return jsonify({
        "name": filename,
        "size": size_mb,
        "url": url,
        "type": file.mimetype
    })



#download file
@app.route("/api/download")
def download_file():

    key = request.args.get("key")
    if not key:
        return jsonify({"error": "missing key"}), 400

    filename = key.split("/")[-1]

    url = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": BUCKET_NAME,
            "Key": key,
            "ResponseContentDisposition": f'attachment; filename="{filename}"'
        },
        ExpiresIn=300
    )

    return jsonify({"url": url})


#  Delete from s3
@app.route("/api/delete", methods=["POST"])
def delete_file():
    info = request.json

    url = info.get("url")
    key = info.get("key")

    # file delete
    if url:
        s3_key = url.split(".amazonaws.com/")[1]
        s3.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
        return jsonify({"status": "file deleted"})

    # folder delete recursive
    if key:
        username = session["user"]

        prefix = f"{username}/{key.rstrip('/')}/"

        paginator = s3.get_paginator("list_objects_v2")

        for page in paginator.paginate(
            Bucket=BUCKET_NAME,
            Prefix=prefix
        ):
            if "Contents" in page:
                objects = [{"Key": obj["Key"]} for obj in page["Contents"]]

                s3.delete_objects(
                    Bucket=BUCKET_NAME,
                    Delete={"Objects": objects}
                )

        return jsonify({"status": "folder deleted"})


    return jsonify({"error": "no target"}), 400




# rename file and folder

def rename_in_drive(data, old_name, new_name, new_s3_key=None):
    def walk(folder):
        for key in list(folder.keys()):
            if key == old_name:
                item = folder.pop(key)

                # update URL if file
                if isinstance(item, dict) and new_s3_key:
                    item["url"] = (
                        f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{new_s3_key}"
                    )

                folder[new_name] = item
                return True

            if isinstance(folder[key], dict):
                if walk(folder[key]):
                    return True
        return False

    walk(data["root"])

def update_urls_recursively(folder, old_prefix, new_prefix):
    for key, item in folder.items():
        if isinstance(item, dict):
            # file
            if "url" in item:
                item["url"] = item["url"].replace(old_prefix, new_prefix)
            # subfolder
            else:
                update_urls_recursively(item, old_prefix, new_prefix)



@app.route("/api/rename", methods=["POST"])
def rename_item():
    info = request.json

    old_key = info.get("old_key")
    new_key = info.get("new_key")
    is_folder = info.get("is_folder")

    if not old_key or not new_key:
        return jsonify({"error": "invalid data"}), 400

    # Required fix
    username = session["user"]

    #  file rename
    if not is_folder:
        content_type = mimetypes.guess_type(new_key)[0] or "application/octet-stream"

        old_s3_key = f"{username}/{old_key}"
        new_s3_key = f"{username}/{new_key}"

        s3.copy_object(
            Bucket=BUCKET_NAME,
            CopySource={"Bucket": BUCKET_NAME, "Key": old_s3_key},
            Key=new_s3_key,
            MetadataDirective="COPY",
            ContentType=content_type,
            ContentDisposition="inline"
        )

        s3.delete_object(Bucket=BUCKET_NAME, Key=old_s3_key)

        # update database
        data = load_data()
        old_name = old_key.split("/")[-1]
        new_name = new_key.split("/")[-1]
        rename_in_drive(data, old_name, new_name, new_s3_key=new_s3_key)
        save_data(data)

        return jsonify({"status": "file renamed"})

    # folder rename
    old_prefix = f"{username}/{old_key.rstrip('/')}/"
    new_prefix = f"{username}/{new_key.rstrip('/')}/"

    resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=old_prefix)

    if "Contents" in resp:
        for obj in resp["Contents"]:
            old_obj_key = obj["Key"]
            new_obj_key = old_obj_key.replace(old_prefix, new_prefix, 1)

            content_type = (
                mimetypes.guess_type(new_obj_key)[0]
                or "application/octet-stream"
            )

            s3.copy_object(
                Bucket=BUCKET_NAME,
                CopySource={"Bucket": BUCKET_NAME, "Key": old_obj_key},
                Key=new_obj_key,
                MetadataDirective="COPY",
                ContentType=content_type,
                ContentDisposition="inline"
            )

            s3.delete_object(Bucket=BUCKET_NAME, Key=old_obj_key)

    # UPDATE DB (folder name only)
    data = load_data()

    old_name = old_key.rstrip("/").split("/")[-1]
    new_name = new_key.rstrip("/").split("/")[-1]

    # rename folder node
    rename_in_drive(data, old_name, new_name)

    # update child file URLs
    old_url_prefix = f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{old_prefix}"
    new_url_prefix = f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{new_prefix}"

    # locate renamed folder in DB
    def find_folder(folder):
        for k, v in folder.items():
            if k == new_name and isinstance(v, dict):
                return v
            if isinstance(v, dict):
                found = find_folder(v)
                if found:
                    return found
        return None

    renamed_folder = find_folder(data["root"])
    if renamed_folder:
        update_urls_recursively(
            renamed_folder,
            old_url_prefix,
            new_url_prefix
        )

    save_data(data)


    return jsonify({"status": "folder renamed"})

# Files Share
@app.route("/api/share", methods=["POST"])
def share_file():
    if "user" not in session:
        return jsonify({"error": "unauthorized"}), 401

    key = request.json.get("key")
    if not key:
        return jsonify({"error": "missing key"}), 400

    # Generate secure temporary link
    url = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": BUCKET_NAME,
            "Key": key,
            "ResponseContentDisposition": "inline"
        },
        ExpiresIn=3600   # 1 hour
    )

    return jsonify({
        "share_url": url,
        "expires_in": 3600
    })


# Storage Info 

@app.route("/api/storage")
def storage():
    username = session.get("user")
    if not username:
        return jsonify({"error": "unauthorized"}), 401

    total_bytes = 0
    paginator = s3.get_paginator("list_objects_v2")

    for page in paginator.paginate(
        Bucket=BUCKET_NAME,
        Prefix=f"{username}/"
    ):
        if "Contents" in page:
            for obj in page["Contents"]:
                total_bytes += obj["Size"]

    used_mb = round(total_bytes / (1024 * 1024), 2)
    return jsonify({"used_mb": used_mb})



#  RUN 

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
