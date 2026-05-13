---
name: remote-deploy
description: Deploy MWL PACS UI project code to a remote host via SSH/SCP and execute docker-compose commands. Optimized for large projects using archiving and progress tracking. Use when the user wants to upload their workspace to a server and run a container stack.
---

# Remote Deploy (Optimized)

This skill automates the process of uploading project files to a remote server and deploying a Docker container stack. It is designed to handle large projects efficiently by archiving files into a single compressed package before upload.

## Features

- **Efficient Upload**: Packages the project into a `.tar.gz` archive to use a single SSH connection.
- **Progress Tracking**: Reports file count and total size before deployment.
- **Smart Exclusions**: Automatically ignores unnecessary directories like `node_modules`, `.git`, `.venv`, and `__pycache__`.
- **Automatic Cleanup**: Removes local and remote archives after extraction.

## Configuration

The skill uses the following host details:
- **Host**: 103.42.117.19
- **Port**: 4434
- **User**: root
- **Base Path**: /home/apps/
- **Default Project Name**: mwl-pacs-ui

## Workflow

1.  **Scanning**: The script scans the project directory (respecting exclusions) to calculate file count and size.
2.  **Archiving**: A compressed `.tar.gz` file is created locally.
3.  **Upload**: The archive is uploaded to `/home/apps/{project-name}` via `scp`.
4.  **Extraction**: The archive is extracted on the remote host, and the original archive is deleted.
5.  **Deployment**: Runs `docker compose up -d --build` on the remote host.

### Command Reference

To deploy the current project:
`python scripts/deploy.py --project mwl-pacs-ui --key .ssh/id_rsa_remote`

To deploy a specific subdirectory (e.g., backend service):
`python scripts/deploy.py --project mwl-pacs-ui-backend --src ./backend --key .ssh/id_rsa_remote --compose-dir backend`

To force a full deployment (ignore incremental mode):
`python scripts/deploy.py --project mwl-pacs-ui --key .ssh/id_rsa_remote --full`

**Note:** The skill must be installed in the `.gemini/skills/` directory for Claude Code to use it automatically when you request deployment actions.

## Handling Errors

- **Connection Refused**: Check if the IP/Port (103.42.117.19:4434) is reachable.
- **Permission Denied**: Ensure the SSH key has the correct permissions (e.g., restricted access on Windows).
- **Docker Errors**: Check the remote logs using `ssh root@103.42.117.19 -p 4434 "cd /home/apps/mwl-pacs-ui && docker compose logs"`.
