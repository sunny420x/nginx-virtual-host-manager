<h1>Nginx Virtual Host Manager in Node.js</h1>
<p>
This node.js app is a web interface for virtual hosts management including create, edit and delete a virtual hosts in nginx web server.
</p>
<h2>.env</h2>
<p>Create file name .env with variables below:</p>
<pre>
PORT=
USERNAME=
PASSWORD=
NGINX_PATH=/etc/nginx/sites-enabled/
</pre>
<ul>
    <li>PORT is a port you want this app to be running on.</li>
    <li>USERNAME is a username that is use to login to control panel.</li>
    <li>PASSWORD is a password that is use to login to control panel.</li>
    <li>NGINX_PATH is a path of 'sites-enabled' or 'sites-available'.</li>
</ul>