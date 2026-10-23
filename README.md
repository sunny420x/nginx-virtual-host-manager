# Cloud Manager

Cloud Manager is a web application for managing Nginx virtual hosts and Node.js applications on a server.

## Features

- Monitor CPU, memory, uptime, and ports currently in use
- Create Node.js and PHP virtual host configuration files, including SSL settings
- View, edit, and delete virtual host files
- Browse and edit files under the configured web root
- View PM2 application status and start, restart, stop, or save applications
- Switch between Light and Dark mode; the selected theme is saved in the browser
- Edit Nginx configuration with syntax highlighting in the Atom One Dark theme

## Requirements

- Node.js and npm
- Nginx on Linux with `systemd`
- System commands used by the app: `systemctl`, `uptime`, `free`, `netstat`, `grep`, `awk`, `sed`, and `sort`
- PM2 for the Node.js Apps page and its controls
- PHP-FPM and the Nginx FastCGI configuration for PHP virtual hosts

The Node.js process needs read and write access to the configured directories and permission to run the Nginx and PM2 commands you use. If `netstat` is unavailable, the used ports panel will not work.

## Installation and configuration

Install the dependencies:

```bash
npm install
```

Create a `.env` file in the project root:

```dotenv
PORT=3000
USERNAME=admin
PASSWORD=replace-with-a-strong-password
NGINX_PATH=/etc/nginx/sites-enabled/
WEB_ROOT=/var/www/html
```

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | Yes | Port used by the web application |
| `USERNAME` | Yes | Login username for the control panel |
| `PASSWORD` | Yes | Login password for the control panel |
| `NGINX_PATH` | Yes | Directory containing virtual host files. Include a trailing `/`. |
| `WEB_ROOT` | No | Root directory available in the Web Root Browser. Defaults to `/var/www/html`. |

## Run

```bash
node app.js
```

Open `http://<server-ip>:3000` and sign in with the `USERNAME` and `PASSWORD` from your `.env` file.

## Nginx configuration

Cloud Manager writes configuration files to `NGINX_PATH` but does not validate their syntax automatically. Before restarting Nginx, validate the configuration:

```bash
sudo nginx -t
```

After it passes, use **Restart Web Server** on the Overview page. The operating system must allow the app process to restart or stop Nginx.

## Security

- Do not commit or expose your `.env` file or its credentials.
- Restrict access to trusted networks. If the app is reachable externally, put it behind a reverse proxy with HTTPS and configure a firewall.
- Signed-in users can edit or delete virtual host files and control Nginx and PM2. Limit access and process permissions accordingly.
