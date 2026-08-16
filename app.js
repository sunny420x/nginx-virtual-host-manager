const fs = require('fs')
const nodePath = require('path')
const express = require('express')
const app = express()
const cookieParser = require('cookie-parser')
const { exec } = require('child_process')
require('dotenv').config()

app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))
app.set('view engine', 'ejs')
app.use(express.static(require('path').join(__dirname, 'assets')));

const username = process.env.USERNAME
const password = process.env.PASSWORD
const nginxPath = process.env.NGINX_PATH
const webRootPath = process.env.WEB_ROOT || '/var/www/html'

function resolveFilePath(fileName) {
    if (!fileName) return null
    if (fileName.startsWith('/')) return fileName
    return `${nginxPath}${fileName}`
}

function isPathAllowed(filePath) {
    if (!filePath) return false
    const normalized = nodePath.resolve(filePath)
    return normalized.startsWith(nodePath.resolve(nginxPath)) || normalized.startsWith(nodePath.resolve(webRootPath))
}

function checkAdmin(req) {
    return new Promise((resolve) => {
        const token = req.cookies && req.cookies.token
        if (!token) return resolve(false)

        const tokenParts = token.split(':')
        if (tokenParts.length < 2) return resolve(false)

        const [cookieUser, encodedPassword] = tokenParts
        if (cookieUser === username && encodedPassword && atob(encodedPassword) === password) {
            return resolve(true)
        }

        return resolve(false)
    })
}

function safeStringArray(value) {
    if (!value || typeof value !== 'string') return []
    return value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
}

app.post('/login', (req, res) => {
    if (req.body.username === username && req.body.password === password) {
        res.cookie('token', `${username}:${btoa(password)}`)
        return res.redirect('/')
    }

    return res.redirect('/login')
})

app.get('/logout', (req, res) => {
    res.cookie('token', '')
    res.redirect('/')
})

app.get('/', async (req, res) => {
    if (!(await checkAdmin(req))) return res.redirect('/login')

    if (req.query.alert !== undefined) {
        return res.render('main', { alert: req.query.alert })
    }

    return res.render('main')
})

app.get('/getVirtualHostsList', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    fs.readdir(nginxPath, (err, files) => {
        if (err) console.log(err)
        res.render('components/virtualhosts', { files })
    })
})

app.get('/getUsedPorts', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    exec(`netstat -tnlp | awk '{print $4}' | grep -oE ':[0-9]+' | grep -oE '[0-9]+' | sort -n`, (err, usedPorts, stderr) => {
        if (err) console.error(err)
        if (stderr) console.error(stderr)
        res.render('components/used_ports', {
            used_ports: safeStringArray(usedPorts),
        })
    })
})

app.get('/getNodeApps', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    exec('pm2 jlist', (err, stdout, stderr) => {
        if (err) {
            console.error(err)
            return res.status(500).send('Unable to fetch PM2 apps.')
        }

        if (stderr) console.error(stderr)

        let apps = []
        try {
            apps = JSON.parse(stdout || '[]')
        } catch (parseErr) {
            console.error('Failed to parse PM2 JSON:', parseErr)
            return res.status(500).send('Unable to parse PM2 apps.')
        }

        const formatUptime = (value) => {
            if (value === undefined || value === null || value === '') return 'N/A'

            // PM2 sometimes provides a timestamp (ms since epoch) or a duration (ms).
            // If the number looks like a timestamp (> ~1e12), compute duration from now.
            let durationMs = 0
            if (typeof value === 'number') {
                if (value > 1e12) {
                    durationMs = Date.now() - value
                    if (durationMs < 0) durationMs = 0
                } else {
                    durationMs = value
                }
            } else {
                return String(value)
            }

            const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
            const years = Math.floor(totalSeconds / 31536000)
            const days = Math.floor((totalSeconds % 31536000) / 86400)
            const hours = Math.floor((totalSeconds % 86400) / 3600)
            const minutes = Math.floor((totalSeconds % 3600) / 60)
            const seconds = totalSeconds % 60

            const parts = []
            if (years) parts.push(`${years}y`)
            if (days) parts.push(`${days}d`)
            if (hours) parts.push(`${hours}h`)
            if (minutes) parts.push(`${minutes}m`)
            // show seconds only when uptime is below 1 minute
            if (!years && !days && !hours && !minutes) parts.push(`${seconds}s`)

            return parts.join(' ')
        }

        const nodeapps = apps.map((app) => app.name || '').filter(Boolean)
        const nodeapps_uptime = apps.map((app) => {
            const uptimeValue = app.pm2_env?.pm_uptime ?? app.pm_uptime ?? app.pm2_env?.ax ?? app.ax
            return formatUptime(uptimeValue)
        })
        const nodeapps_status = apps.map((app) => {
            if (app.pm2_env && app.pm2_env.status) return app.pm2_env.status
            return app.status || 'stopped'
        })
        const nodeapps_mem = apps.map((app) => {
            const memory = app.monit && app.monit.memory ? Number(app.monit.memory) : 0
            return memory > 0 ? `${Math.round(memory / 1024 / 1024)} MB` : '0 MB'
        })

        return res.render('components/nodeapps', {
            nodeapps,
            nodeapps_uptime,
            nodeapps_status,
            nodeapps_mem,
        })
    })
})

app.get('/browse', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    const requestedPath = req.query.path ? decodeURIComponent(req.query.path) : webRootPath
    const basePath = nodePath.resolve(requestedPath)
    const rootBase = nodePath.resolve(webRootPath)
    const safePath = basePath.startsWith(rootBase) ? basePath : rootBase

    fs.readdir(safePath, { withFileTypes: true }, (err, entries) => {
        if (err) {
            console.error(err)
            return res.status(500).send('Unable to read directory.')
        }

        const items = entries
            .map((entry) => {
                const itemPath = nodePath.join(safePath, entry.name)
                const isDirectory = entry.isDirectory()
                return {
                    name: entry.name,
                    path: itemPath,
                    isDirectory,
                    isFile: entry.isFile(),
                    icon: isDirectory ? 'fa-folder' : 'fa-file-lines',
                }
            })
            .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))

        const parentPath = nodePath.dirname(safePath)
        const currentPath = safePath
        const canGoUp = currentPath !== rootBase

        return res.render('components/webroot_browser', {
            items,
            currentPath,
            parentPath,
            canGoUp,
            rootBase,
        })
    })
})

app.get('/getWebRootBrowser', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')
    const requestedPath = req.query.path ? decodeURIComponent(req.query.path) : webRootPath
    const rootBase = nodePath.resolve(webRootPath)
    const resolvedPath = nodePath.resolve(requestedPath)
    const safePath = resolvedPath.startsWith(rootBase) ? resolvedPath : rootBase

    fs.readdir(safePath, { withFileTypes: true }, (err, entries) => {
        if (err) {
            console.error(err)
            return res.status(500).send('Unable to read directory.')
        }

        const items = entries
            .map((entry) => {
                const itemPath = nodePath.join(safePath, entry.name)
                const isDirectory = entry.isDirectory()
                return {
                    name: entry.name,
                    path: itemPath,
                    isDirectory,
                    isFile: entry.isFile(),
                    icon: isDirectory ? 'fa-folder' : 'fa-file-lines',
                }
            })
            .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))

        const parentPath = nodePath.dirname(safePath)
        const currentPath = safePath
        const canGoUp = currentPath !== rootBase

        return res.render('components/webroot_browser', {
            items,
            currentPath,
            parentPath,
            canGoUp,
            rootBase,
        })
    })
})

app.get('/login', async (req, res) => {
    if (!(await checkAdmin(req))) {
        return res.render('login')
    }

    return res.redirect('/')
})

app.post('/createNodeJSVirtualHost', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    const app_name = req.body.app_name
    const server_name = req.body.server_name
    const app_path = req.body.app_path
    const ssl_file_name = req.body.ssl_file_name ?? ''
    const port = req.body.port
    const ssl_enabled = req.body.ssl_enabled ?? false
    const folders = req.body.folders && req.body.folders !== '' ? req.body.folders.split(',') : []

    const status = await createNodeJSVirtualHost(app_name, server_name, app_path, ssl_file_name, port, ssl_enabled, folders)
    if (status === true) {
        return res.redirect(`/?alert=Created ${app_name} success.`)
    }

    return res.redirect('/?alert=Error.')
})

app.post('/createPHPVirtualHost', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    const app_name = req.body.app_name
    const server_name = req.body.server_name
    const root_dir = req.body.root_dir
    const php_version = req.body.php_version
    const ssl_file_name = req.body.ssl_file_name ?? ''
    const ssl_enabled = req.body.ssl_enabled ?? false

    const status = await createPHPVirtualHost(app_name, server_name, ssl_file_name, ssl_enabled, root_dir, php_version)
    if (status === true) {
        return res.redirect(`/?alert=Created ${app_name} success.`)
    }

    return res.redirect('/?alert=Error.')
})

function createPHPVirtualHost(app_name, server_name, ssl_file_name, ssl_enabled, root_dir, php_version) {
    return new Promise((resolve) => {
        let template = 'server {'

        if (ssl_enabled) {
            template += '\n\tlisten 443 ssl;\n\tlisten [::]:443 ssl;'
        } else {
            template += '\n\tlisten 80;\n\tlisten [::]:80;'
        }

        template += `\n\n\tserver_name ${server_name};`
        template += '\n\n\tindex index.php index.html index.htm;'
        template += `\n\n\troot ${root_dir};`

        if (ssl_enabled) {
            template += `\n\tssl_certificate /etc/nginx/ssl/${ssl_file_name}.crt;\n\tssl_certificate_key /etc/nginx/ssl/${ssl_file_name}.key;`
        }

        template += `\n\taccess_log /var/log/nginx/${app_name}-access.log;\n\terror_log /var/log/nginx/${app_name}-error.log;\n`
        template += '\n\tlocation / {\n\t\ttry_files $uri $uri/ =404;\n\t}\n'
        template += `\n\tlocation ~ \.php$ {\n\t\tinclude snippets/fastcgi-php.conf;\n\t\tfastcgi_pass unix:/run/php/php${php_version}-fpm.sock;\n\t}`
        template += '\n}'

        fs.writeFile(`${nginxPath}/${app_name}`, template, (err) => {
            if (err) console.log(err)
            return resolve(true)
        })
    })
}

function createNodeJSVirtualHost(app_name, server_name, app_path, ssl_file_name, port, ssl_enabled, folders) {
    return new Promise((resolve) => {
        let template = 'server {'

        if (ssl_enabled) {
            template += '\n\tlisten 443 ssl;\n\tlisten [::]:443 ssl;'
        } else {
            template += '\n\tlisten 80;\n\tlisten [::]:80;'
        }

        template += `\n\n\tserver_name ${server_name};`

        if (ssl_enabled) {
            template += `\n\tssl_certificate /etc/nginx/ssl/${ssl_file_name}.crt;\n\tssl_certificate_key /etc/nginx/ssl/${ssl_file_name}.key;`
        }

        template += '\n\tproxy_connect_timeout 3;\n\tproxy_send_timeout 3;\n\tproxy_read_timeout 3;\n\tsend_timeout 3;'
        template += `\n\taccess_log /var/log/nginx/${app_name}-access.log;\n\terror_log /var/log/nginx/${app_name}-error.log;`
        template += `\n\tlocation / {\n\t\tproxy_pass http://localhost:${port};\n\t`

        if (ssl_enabled) {
            template += 'proxy_ssl_server_name on;\n\t}'
        } else {
            template += '}'
        }

        if (folders.length > 0) {
            for (let i = 0; i < folders.length; i++) {
                template += `\n\tlocation /${folders[i]}/ {\n\t\talias ${app_path}/public/${folders[i]}/;\n\t}`
            }
        }

        template += '\n}'

        fs.writeFile(`${nginxPath}/${app_name}`, template, (err) => {
            if (err) console.log(err)
            return resolve(true)
        })
    })
}

app.get('/delete/:file_name', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    fs.unlink(`${nginxPath}${req.params.file_name}`, (err) => {
        if (err) console.log(err)
        res.redirect('/?alert=Delete Success.')
    })
})

app.get('/view/:file_name', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    const resolvedPath = resolveFilePath(req.params.file_name)
    fs.readFile(resolvedPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err)
            return res.status(500).send('Error reading file.')
        }

        res.render('view', {
            content: data,
            name: req.params.file_name,
            filePath: resolvedPath,
            backUrl: '/',
        })
    })
})

app.get('/view-file', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    const requestedFile = req.query.path ? decodeURIComponent(req.query.path) : ''
    if (!requestedFile || !isPathAllowed(requestedFile)) {
        return res.status(400).send('Invalid file path.')
    }

    fs.readFile(requestedFile, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err)
            return res.status(500).send('Error reading file.')
        }

        const parentDir = nodePath.dirname(requestedFile)
        res.render('view', {
            content: data,
            name: nodePath.basename(requestedFile),
            filePath: requestedFile,
            backUrl: '/',
        })
    })
})

app.post('/update_file', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    const file_name = req.body.file_name
    const content = req.body.content
    const targetFile = file_name && file_name.startsWith('/') ? file_name : resolveFilePath(file_name)

    if (!targetFile || !isPathAllowed(targetFile)) {
        return res.status(400).send('Invalid file path.')
    }

    fs.writeFile(targetFile, content, (err) => {
        if (err) {
            console.error('Error appending to file:', err)
        } else if (file_name && file_name.startsWith('/')) {
            // If the saved file is under nginxPath, redirect back to the logical /view/:file_name
            if (targetFile.startsWith(nginxPath)) {
                let rel = targetFile.slice(nginxPath.length)
                if (rel.startsWith('/')) rel = rel.slice(1)
                return res.redirect('/view/' + rel)
            }

            // Otherwise redirect to the file viewer route for absolute paths
            return res.redirect('/view-file?path=' + encodeURIComponent(targetFile))
        } else {
            res.redirect('/view/' + file_name)
        }
    })
})

app.get('/restart', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    res.redirect('/')
    exec('systemctl restart nginx', (err, stdout, stderr) => {
        if (err) console.error(err)
        if (stderr) console.error(stderr)
    })
})

app.get('/stop', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    res.redirect('/')
    exec('systemctl stop nginx', (err, stdout, stderr) => {
        if (err) console.error(err)
        if (stderr) console.error(stderr)
    })
})

app.get('/getMemoryStat', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    exec("free -h | awk '/^Mem:/ {print $7}'", (err, stdout, stderr) => {
        if (err) console.error(err)
        if (stderr) console.error(stderr)
        res.send(`<b>Available Memory:</b> ${stdout}</pre>`)
    })
})

app.get('/getUptime', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    exec("uptime -p | sed 's/up //'", (err, stdout, stderr) => {
        if (err) console.error(err)
        if (stderr) console.error(stderr)
        res.send(`<b>Uptime</b>: ${stdout}`)
    })
})

app.get('/getCPUusage', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    exec(`grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage "%"}'`, (err, stdout, stderr) => {
        if (err) console.error(err)
        if (stderr) console.error(stderr)
        res.send(`<b>CPU Usage:</b> ${stdout}`)
    })
})

app.get('/restart/node/:name', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    const name = req.params.name
    exec(`pm2 restart ${name}`, (err) => {
        if (err) {
            return res.status(500).send(err)
        }
        return res.status(200).send(`Restarted ${name} !`)
    })
})

app.get('/start/node/:name', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    const name = req.params.name
    exec(`pm2 start ${name}`, (err) => {
        if (err) {
            return res.status(500).send(err)
        }
        return res.status(200).send(`Started ${name} !`)
    })
})

app.get('/stop/node/:name', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    const name = req.params.name
    exec(`pm2 stop ${name}`, (err) => {
        if (err) {
            return res.status(500).send(err)
        }
        return res.status(200).send(`Stopped ${name} !`)
    })
})

app.get('/pm2/save', async (req, res) => {
    if (!(await checkAdmin(req))) return res.status(401).send('Please login.')

    exec('pm2 save', (err) => {
        if (err) {
            return res.status(500).send(err)
        }
        return res.status(200).send('Apps has been saved !')
    })
})

app.listen(process.env.PORT, () => {
    console.log('[+] NVHM is started on ' + process.env.PORT)
})