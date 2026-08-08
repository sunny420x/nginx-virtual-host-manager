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

# Web Interface Preview
<img width="1919" height="940" alt="Screenshot 2026-08-08 100059" src="https://github.com/user-attachments/assets/e09e1d86-eec4-4ec3-ae38-b50d4599405e" />
<img width="1897" height="936" alt="image" src="https://github.com/user-attachments/assets/a3aeded1-7af4-465e-a2b2-358f5966ffc5" />
<img width="1897" height="938" alt="image" src="https://github.com/user-attachments/assets/3b22e1d3-cbce-442b-af2e-c17a191f817d" />
