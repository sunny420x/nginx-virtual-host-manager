const fs = require('fs')
const express = require('express')
const app = express()
const ejs = require('ejs')
const cookieParser = require('cookie-parser')
var exec = require('child_process').exec;
require('dotenv').config()

app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))
app.set('view engine', 'ejs')

const username = process.env.USERNAME
const password = process.env.PASSWORD
const path =  process.env.NGINX_PATH

function checkAdmin(req) {
    return new Promise(resolve => {
        if(req.cookies.token != undefined) {
            if(req.cookies.token.split(':')[0] == username && atob(req.cookies.token.split(':')[1]) == password) {
                resolve(true)
            } else {
                resolve(false)
            }
        } else {
            resolve(false)
        }
    })
}

app.post('/login', (req,res) => {
    if(req.body.username == username && req.body.password == password) {
        res.cookie('token', `${username}:${btoa(password)}`)
        res.redirect('/')
    } else {
        res.redirect('/login')
    }
})

app.get('/logout',(req,res) => {
    res.cookie('token', '')
    res.redirect('/')
})

app.get('/', (req, res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            fs.readdir(path, (err, files) => {
                if(err) throw err;
                if(req.query.alert != undefined) {
                    res.render('main', {
                        alert: req.query.alert,
                        files:files
                    })   
                } else {
                    res.render('main', {
                        files:files
                    })   
                }
            });
        } else {
            res.redirect("/login")
        }
    })
})

app.get('/login', (req, res) => {
    checkAdmin(req).then((result) => {
        if(!result) {
            res.render('login')
        } else {
            res.redirect('/')
        }
    })
})

app.post('/createNodeJSVirtualHost', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            const app_name = req.body.app_name
            const server_name = req.body.server_name
            const app_path = req.body.app_path
            const ssl_file_name = req.body.ssl_file_name ?? ""
            const port = req.body.port
            const ssl_enabled = req.body.ssl_enabled ?? false
            if(req.body.folders != "") {
                folders = req.body.folders.split(',')
            } else {
                folders = []
            }
        
            createNodeJSVirtualHost(app_name, server_name, app_path, ssl_file_name, port, ssl_enabled, folders).then((status) => {
                if(status == true) {
                    res.redirect(`/?alert=Created ${app_name} success.`)
                } else {
                    res.redirect(`/?alert=Error.`)
                }
            })
        }
    })
})

app.post('/createPHPVirtualHost', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            const app_name = req.body.app_name
            const server_name = req.body.server_name
            const root_dir = req.body.root_dir
            const php_version = req.body.php_version
            const ssl_file_name = req.body.ssl_file_name ?? ""
            const ssl_enabled = req.body.ssl_enabled ?? false
        
            createPHPVirtualHost(app_name, server_name, ssl_file_name, ssl_enabled, root_dir, php_version).then((status) => {
                if(status == true) {
                    res.redirect(`/?alert=Created ${app_name} success.`)
                } else {
                    res.redirect(`/?alert=Error.`)
                }
            })
        }
    })
})

function createPHPVirtualHost(app_name, server_name, ssl_file_name, ssl_enabled, root_dir, php_version) {
    return new Promise((resolve) => {
        template = `server {`

        if(ssl_enabled) {
            template += `\n\tlisten 443 ssl;\n\tlisten [::]:443 ssl;`
        } else {
            template += `\n\tlisten 80;\n\tlisten [::]:80;`
        }
    
        template += `\n\n\tserver_name ${server_name};`
        template += `\n\n\tindex index.php index.html index.htm;`
        template += `\n\n\troot ${root_dir};`
    
        if(ssl_enabled) {
            template += `\n\tssl_certificate /Storage/SSL_KEY/${ssl_file_name}-public-key.pem;\n\tssl_certificate_key /Storage/SSL_KEY/${ssl_file_name}-private-key.pem;`
        }
    
        template += `\n\taccess_log /var/log/nginx/${app_name}-access.log;\n\terror_log /var/log/nginx/${app_name}-error.log;]\n`

        template += `\n\tlocation / {\n\t\ttry_files $uri $uri/ =404;\n\t}\n`

        template += `\n\tlocation ~ \.php$ {\n\t\tinclude snippets/fastcgi-php.conf;\n\t\tfastcgi_pass unix:/run/php/php${php_version}-fpm.sock;\n\t}`
    
        template += `\n}`
    
        fs.writeFile(`${path}/${app_name}`, template, err => {
            if(err) console.log(err)
            resolve(true)
        })
    })
}

function createNodeJSVirtualHost(app_name, server_name, app_path, ssl_file_name, port, ssl_enabled, folders) {
    return new Promise((resolve) => {
        template = `server {`

        if(ssl_enabled) {
            template += `\n\tlisten 443 ssl;\n\tlisten [::]:443 ssl;`
        } else {
            template += `\n\tlisten 80;\n\tlisten [::]:80;`
        }
    
        template += `\n\n\tserver_name ${server_name};`
    
        if(ssl_enabled) {
            template += `\n\tssl_certificate /Storage/SSL_KEY/${ssl_file_name}-public-key.pem;\n\tssl_certificate_key /Storage/SSL_KEY/${ssl_file_name}-private-key.pem;
            `
        }
    
        template += `\n\tproxy_connect_timeout 3;\n\tproxy_send_timeout 3;\n\tproxy_read_timeout 3;\n\tsend_timeout 3;
        `
    
        template += `\n\taccess_log /var/log/nginx/${app_name}-access.log;\n\terror_log /var/log/nginx/${app_name}-error.log;
        `
    
        template += `\n\tlocation / {\n\t\tproxy_pass http://localhost:${port};\n\t`

        if(ssl_enabled) {
            template += `\tproxy_ssl_server_name on;\n\t}`
        } else {
            template += `}`
        }
    
        if(folders.length > 0) {
            for(i = 0; i < folders.length; i++) {
                template += `\n\tlocation /${folders[i]}/ {\n\t\talias ${app_path}/public/${folders[i]}/;\n\t}`
            }
        }
        template += `\n}`
    
        fs.writeFile(`${path}/${app_name}`, template, err => {
            if(err) console.log(err)
            resolve(true)
        })
    })
}

app.get('/delete/:file_name', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            fs.unlink(path+req.params.file_name,function(err){
                if(err) console.log(err)
                res.redirect('/?alert=Delete Success.')
            });  
        }
    })
})

app.get('/view/:file_name', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            fs.readFile(path+req.params.file_name, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading file:', err);
                    return;
                }
                res.send(`<pre>${data}</pre>`)
            });
        }
    })
})

app.get('/restart', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            res.redirect('/')
            exec('systemctl restart nginx', (err, stdout, stderr) => {
                if (err) console.error(err);
                if (stderr) console.error(stderr);
            });
        }
    })
})

app.get('/stop', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            res.redirect('/')
            exec('systemctl stop nginx', (err, stdout, stderr) => {
                if (err) console.error(err);
                if (stderr) console.error(stderr);
            });
        }
    })
})

app.get('/getMemoryStat', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            exec("free -h | awk '/^Mem:/ {print $7}'", (err, stdout, stderr) => {
                if (err) console.error(err);
                if (stderr) console.error(stderr);
                res.send(`<b>Available Memory:</b> ${stdout}</pre>`)
            });
        }
    })
})

app.get('/getUptime', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            exec(`uptime | awk -F'( |,|:)+' '{print $6,$7",",$8,"hours,",$9,"minutes"}'`, (err, stdout, stderr) => {
                if (err) console.error(err);
                if (stderr) console.error(stderr);
                res.send(`<b>Uptime</b>: ${stdout}`)
            });
        }
    })
})

app.get('/getCPUusage', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            exec(`grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage "%"}'`, (err, stdout, stderr) => {
                if (err) console.error(err);
                if (stderr) console.error(stderr);
                res.send(`<b>CPU Usage:</b> ${stdout}`)
            });
        }
    })
})

app.listen(process.env.PORT);