<h1>Nginx Virtual Host Manager in Node.js</h1>
<p>
This node.js app is a web interface for virtual hosts management including create, edit and delete a virtual hosts in nginx web server.
</p>
<h2>.env</h2>
<p>Create file name .env with variables below:</p>
<pre>
#PORT will be use as a port for this node application.
PORT=

#Web Interface Login.
USERNAME=
PASSWORD=

#.conf folder location.
NGINX_PATH=/etc/nginx/sites-enabled/
</pre>
<ul>
    <li>PORT is a port you want this app to be running on.</li>
    <li>USERNAME The username required to log into the control panel.</li>
    <li>PASSWORD The password required to log into the control panel.</li>
    <li>NGINX_PATH The path to the Nginx configuration directory, 'sites-enabled' or 'sites-available'.</li>
</ul>