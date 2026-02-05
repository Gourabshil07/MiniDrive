from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import boto3
import json
import mimetypes
from flask import session
import secrets

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)

# S3 CONFIG 
BUCKET_NAME = "gourab-gdrive"
REGION = "ap-south-1"

s3 = boto3.client("s3", region_name=REGION)

# DATABASE
DB_FILE = "database.db"


def get_db():
    return sqlite3.connect(DB_FILE)


# INIT DRIVE TABLE 

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

    # AUTO CREATE DRIVE IF MISSING
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


# ROUTES

@app.route("/")
def home():
    return redirect(url_for("login"))


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = request.form["username"]
        password = generate_password_hash(request.form["password"])


        db = get_db()
        cursor = db.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )
        """)

        try:
            cursor.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (username, password)
            )

            # CREATE EMPTY DRIVE
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
        except:
            flash("Username already exists")
            db.close()
            return redirect(url_for("signup"))

        db.close()
        return redirect(url_for("login"))

    return render_template("signup.html")

# LOGIN ROUTE
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

        # SINGLE CHECK ONLY
        if user and check_password_hash(user[2], password):

            session["user"] = user[1]
            session["role"] = user[3]     
            return redirect(url_for("dashboard"))

        else:
            flash("Invalid credentials")
            return redirect(url_for("login"))

    return render_template("login.html")

#LOGOUT ROUTE 
@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))


#DASHBOARD ROUTE 
@app.route("/dashboard")
def dashboard():

    if not session.get("user"):
        return redirect(url_for("login"))

    return render_template(
        "dashboard.html",
        username=session["user"]
    )


#admin dashboard route
@app.route("/admin")
def admin_panel():

    if "user" not in session:
        return redirect(url_for("login"))

    if session.get("role") != "admin":
        return "Access Denied", 403

    db = get_db()
    cursor = db.cursor()

    users = cursor.execute(
        "SELECT id, username, role FROM users"
    ).fetchall()

    db.close()

    return render_template("admin.html", users=users)

# DRIVE API

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



#  CREATE FOLDER 

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
        s3_key = "/".join(path[1:] + [name]) + "/"
        s3.put_object(Bucket=BUCKET_NAME, Key=s3_key)

    except Exception as e:
        print("S3 error:", e)
        return jsonify({"error": "S3 failed"}), 500


    save_data(data)

    return jsonify({"status": "created"})




#  FILE UPLOAD 

@app.route("/api/upload", methods=["POST"])
def upload_file():
    file = request.files.get("file")
    path = json.loads(request.form.get("path"))

    if not file:
        return jsonify({"error": "no file"}), 400

    filename = secure_filename(file.filename)

    # READ FILE INTO MEMORY ONCE 
    file_bytes = file.read()
    size_mb = round(len(file_bytes) / (1024 * 1024), 2)

    # build S3 key
    username = session["user"]

    s3_key = "/".join(
        [username] + path[1:] + [filename]
    )


    #  UPLOAD USING BYTES (SAFE WAY)
    s3.put_object(Bucket=BUCKET_NAME, Key=s3_key, Body=file_bytes, ContentType=file.mimetype, ContentDisposition="inline")

    url = f"https://{BUCKET_NAME}.s3.{REGION}.amazonaws.com/{s3_key}"

    # SAVE FILE INTO DB STRUCTURE
    data = load_data()

    ref = data["root"]
    for i in range(1, len(path)):
        ref = ref[path[i]]

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

# DELETE FILE FROM S3 
@app.route("/api/delete", methods=["POST"])
def delete_file():
    info = request.json

    url = info.get("url")
    key = info.get("key")

    # FILE DELETE
    if url:
        s3_key = url.split(".amazonaws.com/")[1]
        s3.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
        return jsonify({"status": "file deleted"})

    # FOLDER DELETE
    if key:
        prefix = key if key.endswith("/") else key + "/"

        resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)

        if "Contents" in resp:
            for obj in resp["Contents"]:
                s3.delete_object(
                    Bucket=BUCKET_NAME,
                    Key=obj["Key"]
                )

        return jsonify({"status": "folder deleted"})

    return jsonify({"error": "no target"}), 400




# RENAME FILE/FOLDER 
@app.route("/api/rename", methods=["POST"])
def rename_item():
    info = request.json

    old_key = info.get("old_key")
    new_key = info.get("new_key")
    is_folder = info.get("is_folder")

    if not old_key or not new_key:
        return jsonify({"error": "invalid data"}), 400

    #  FILE RENAME
    if not is_folder:
        content_type = mimetypes.guess_type(new_key)[0] or "application/octet-stream"

        s3.copy_object(
            Bucket=BUCKET_NAME,
            CopySource={"Bucket": BUCKET_NAME, "Key": old_key},
            Key=new_key,
            MetadataDirective="COPY",
            ContentType=content_type,
            ContentDisposition="inline"
        )

        s3.delete_object(Bucket=BUCKET_NAME, Key=old_key)
        return jsonify({"status": "file renamed"})

    #  FOLDER RENAME (RECURSIVE)
    old_prefix = old_key if old_key.endswith("/") else old_key + "/"
    new_prefix = new_key if new_key.endswith("/") else new_key + "/"

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

    return jsonify({"status": "folder renamed"})



#  STORAGE INFO 

@app.route("/api/storage", methods=["GET"])
def storage():
    total_bytes = 0

    resp = s3.list_objects_v2(Bucket=BUCKET_NAME)
    if "Contents" in resp:
        for obj in resp["Contents"]:
            total_bytes += obj["Size"]

    used_mb = round(total_bytes / (1024 * 1024), 2)

    return jsonify({"used_mb": used_mb})


#  RUN 

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
