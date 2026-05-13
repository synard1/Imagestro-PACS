import argparse
import subprocess
import sys
import os
import tarfile
import time
import json

STATE_FILE = ".deploy_state.json"

def run_command(cmd, show_output=False):
    """Executes a command, captures its output, and handles errors."""
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')

    if result.returncode != 0:
        print(f"--- ERROR ---")
        print(f"Command failed: {' '.join(cmd)}")
        print("--- STDOUT ---")
        try:
            print(result.stdout)
        except UnicodeEncodeError:
            print(result.stdout.encode('utf-8', errors='replace').decode('utf-8', errors='replace'))
        print("--- STDERR ---")
        try:
            print(result.stderr)
        except UnicodeEncodeError:
            print(result.stderr.encode('utf-8', errors='replace').decode('utf-8', errors='replace'))
        print("---------------")
        sys.exit(result.returncode)

    if show_output:
        try:
            print(result.stdout)
        except UnicodeEncodeError:
            print(result.stdout.encode('utf-8', errors='replace').decode('utf-8', errors='replace'))

    return result.stdout

def get_project_stats(src_path, exclude_dirs, last_deploy_time=0):
    file_count = 0
    total_size = 0
    files_to_include = []

    abs_src = os.path.abspath(src_path)
    global_exclude = set(exclude_dirs)

    for root, dirs, files in os.walk(abs_src):
        local_ignore = set()
        if '.geminiignore' in files:
            try:
                with open(os.path.join(root, '.geminiignore'), 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            ignore_name = line.rstrip('/')
                            local_ignore.add(ignore_name)
            except Exception:
                pass

        dirs[:] = [d for d in dirs if d not in global_exclude and d not in local_ignore and not d.startswith('.')]

        for file in files:
            if file.startswith('.') and file not in ['.env', '.gitignore', '.geminiignore']:
                continue

            if file in local_ignore:
                continue

            filepath = os.path.join(root, file)
            try:
                mtime = os.path.getmtime(filepath)
                if mtime > last_deploy_time:
                    rel_path = os.path.relpath(filepath, abs_src)
                    files_to_include.append((filepath, rel_path))
                    file_count += 1
                    total_size += os.path.getsize(filepath)
            except:
                continue

    return file_count, total_size, files_to_include

def format_size(size):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} TB"

def load_state(project):
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r') as f:
                return json.load(f).get(project, 0)
        except:
            pass
    return 0

def save_state(project, timestamp):
    state = {}
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r') as f:
                state = json.load(f)
        except:
            pass
    state[project] = timestamp
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)

def deploy(project, src, key, host, port, user, base_path, compose_dir=None, force_full=False):
    remote_path = f"{base_path}/{project}"
    archive_name = f"{project}_diff_deploy.tar"
    # Exclude directories known to be large or irrelevant
    exclude_dirs = {'.git', 'node_modules', '__pycache__', '.venv', '.pytest_cache', '.ssh', 'dist', 'build', '.claude', '.gemini', '.history'}

    last_deploy = 0 if force_full else load_state(project)
    current_time = time.time()

    print(f"--- Deployment Started (Incremental Mode): {project} ---")
    print(f"Source: {os.path.abspath(src)}")
    if last_deploy > 0:
        print(f"Mode: INCREMENTAL (Changes since last deploy)")
    else:
        print(f"Mode: FULL (Initial sync)")

    print("1. Scanning project files for changes...")
    file_count, total_size, files = get_project_stats(src, exclude_dirs, last_deploy)

    if file_count == 0:
        print("   - No changes detected. Deployment skipped.")
        return

    print(f"   - Found: {file_count} changed files, Total Size: {format_size(total_size)}")

    print(f"2. Creating differential archive (no compression): {archive_name}...")
    start_time = time.time()
    # Using 'w' instead of 'w:gz' to avoid MemoryError and speed up large syncs
    with tarfile.open(archive_name, "w") as tar:
        for filepath, rel_path in files:
            tar.add(filepath, arcname=rel_path)
    archive_size = os.path.getsize(archive_name)
    print(f"   - Archive created in {time.time() - start_time:.2f}s (Size: {format_size(archive_size)})")

    print("3. Preparing remote directory...")
    run_command(["ssh", "-i", key, "-p", str(port), f"{user}@{host}", f"mkdir -p {remote_path}"])

    print(f"4. Uploading {archive_name}...")
    start_time = time.time()
    run_command(["scp", "-i", key, "-P", str(port), archive_name, f"{user}@{host}:{remote_path}/"])
    print(f"   - Upload completed in {time.time() - start_time:.2f}s")

    # Save state after successful upload, so even if build fails, we don't re-upload everything
    save_state(project, current_time)

    print("5. Extracting and merging on remote...")
    extract_cmd = f"cd {remote_path} && tar -xf {archive_name} && rm {archive_name}"
    run_command(["ssh", "-i", key, "-p", str(port), f"{user}@{host}", extract_cmd])

    print("5.5 Making shell scripts executable...")
    chmod_cmd = f"find {remote_path} -name '*.sh' -exec chmod +x {{}} +"
    run_command(["ssh", "-i", key, "-p", str(port), f"{user}@{host}", chmod_cmd])

    working_dir = remote_path
    if compose_dir:
        working_dir = f"{remote_path}/{compose_dir}"

    print(f"6. Building and starting container stack in {working_dir}...")
    build_cmd = f"cd {working_dir} && docker compose build"
    run_command(["ssh", "-i", key, "-p", str(port), f"{user}@{host}", build_cmd])

    deploy_cmd = f"cd {working_dir} && docker compose up -d"
    run_command(["ssh", "-i", key, "-p", str(port), f"{user}@{host}", deploy_cmd], show_output=True)

    print("7. Cleaning up and saving state...")
    os.remove(archive_name)
    save_state(project, current_time)

    print(f"--- Deployment Successful: {project} ---")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Optimized incremental project deployment.")
    parser.add_argument("--project", required=True, help="Project name on remote")
    parser.add_argument("--src", default=".", help="Source directory to deploy")
    parser.add_argument("--compose-dir", help="Subdirectory where docker-compose.yml is located")
    parser.add_argument("--key", required=True, help="Path to SSH private key")
    parser.add_argument("--host", default="103.42.117.19", help="Remote host IP")
    parser.add_argument("--port", default=4434, type=int, help="Remote SSH port")
    parser.add_argument("--user", default="root", help="Remote SSH user")
    parser.add_argument("--base-path", default="/home/apps", help="Remote base path")
    parser.add_argument("--full", action="store_true", help="Force a full deployment")

    args = parser.parse_args()
    key_path = os.path.expanduser(args.key)

    if not os.path.exists(key_path):
        print(f"Error: Key file not found at {key_path}")
        sys.exit(1)

    deploy(args.project, key_path, args.host, args.port, args.user, args.base_path, args.compose_dir, args.full)
