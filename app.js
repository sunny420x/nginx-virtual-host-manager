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
                if(err) console.log(err);
                exec(`pm2 list | awk 'NR>2 {print $4}'`, (err, nodeapps, stderr) => {
                    if (err) console.error(err);
                    if (stderr) console.error(stderr);
                    nodeapps = nodeapps.trim().split('\n')
                    exec(`pm2 list | awk 'NR>2 {print $14}'`, (err, nodeapps_uptime, stderr) => {
                        if (err) console.error(err);
                        if (stderr) console.error(stderr);
                        nodeapps_uptime = nodeapps_uptime.trim().split('\n')
                        exec(`pm2 list | awk 'NR>2 {print $18}'`, (err, nodeapps_status, stderr) => {
                            if (err) console.error(err);
                            if (stderr) console.error(stderr);
                            nodeapps_status = nodeapps_status.trim().split('\n')
                            exec(`pm2 list | awk 'NR>2 {print $22}'`, (err, nodeapps_mem, stderr) => {
                                if (err) console.error(err);
                                if (stderr) console.error(stderr);
                                nodeapps_mem = nodeapps_mem.trim().split('\n')
                                exec(`netstat -tnlp | awk '{print $4}' | grep -oE ':[0-9]+' | grep -oE '[0-9]+' | sort -n`, (err, used_ports, stderr) => {
                                    if (err) console.error(err);
                                    if (stderr) console.error(stderr);
                                    used_ports = used_ports.trim().split('\n')
                                    if(req.query.alert != undefined) {
                                        res.render('main', {
                                            alert: req.query.alert,
                                            files:files,
                                            nodeapps:nodeapps,
                                            nodeapps_uptime:nodeapps_uptime,
                                            nodeapps_status:nodeapps_status,
                                            nodeapps_mem:nodeapps_mem,
                                            used_ports:used_ports,
                                        })   
                                    } else {
                                        res.render('main', {
                                            files:files,
                                            nodeapps:nodeapps,
                                            nodeapps_uptime:nodeapps_uptime,
                                            nodeapps_status:nodeapps_status,
                                            nodeapps_mem:nodeapps_mem,
                                            used_ports:used_ports,
                                        })   
                                    }
                                })
                            })
                        })
                    })
                });
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
    
        template += `\n\taccess_log /var/log/nginx/${app_name}-access.log;\n\terror_log /var/log/nginx/${app_name}-error.log;\n`

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
                res.render('view',{
                    content: data,
                    name: req.params.file_name
                })
            });
        }
    })
})

app.post('/update_file', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            file_name = req.body.file_name
            content = req.body.content
            fs.writeFile(path+file_name, content, (err) => {
                if (err) {
                    console.error('Error appending to file:', err);
                } else {
                    res.redirect('/view/'+file_name)
                }
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
            exec(`uptime -p | sed 's/up //'`, (err, stdout, stderr) => {
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

app.get('/getElectricCost', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            exec(`cat /tmp/powerstat_output.txt`, (err, stdout, stderr) => {
                if (err) console.error(err);
                if (stderr) console.error(stderr);
                res.send(`<b>Electric Cost:</b> ${(86400 * parseFloat(stdout.trim()) / 30 * 3 / 3600).toFixed(2)} baht / month`)
            });
        }
    })
})

app.get('/restart/node/:name', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            const name = req.params.name
            exec(`pm2 restart ${name}`, (err, stderr) => {
                if (err) console.error(err);
                if (stderr) console.error(stderr);
                res.redirect(`/?alert=Restart ${name} success !`)
            });
        }
    })
})

app.get('/start/node/:name', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            const name = req.params.name
            exec(`pm2 start ${name}`, (err, stderr) => {
                if (err) console.error(err);
                if (stderr) console.error(stderr);
                res.redirect(`/?alert=Start ${name} success !`)
            });
        }
    })
})

app.get('/stop/node/:name', (req,res) => {
    checkAdmin(req).then((result) => {
        if(result) {
            const name = req.params.name
            exec(`pm2 stop ${name}`, (err, stderr) => {
                if (err) console.error(err);
                if (stderr) console.error(stderr);
                res.redirect(`/?alert=Stop ${name} success !`)
            });
        }
    })
})

app.listen(process.env.PORT);