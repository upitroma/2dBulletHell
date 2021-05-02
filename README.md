# 2dBulletHell
## A multiplayer bullet hell to practice more advanced multiplayer stuff

### How to run:
0. clone repo ```git clone https://github.com/upitroma/2dBulletHell.git```
1. make sure [Node.js](https://nodejs.org/) is installed
2. ```cd 2dBulletHell```
3. run ```npm update``` to download necessary packages
4. run ```node index.js``` to start the server
5. web server is on port 4000 by default.

### Electron standalone (not needed for webapp)
0. start server. [How to run](#How-to-run)
1. ```cd public```
2. edit client.js and change <br>
```js
var socket = io.connect(window.location.href)
``` 
to <br>
```js
var socket = io.connect("http://YOUR_SERVER_IP:4000")
```
3. run ```npm install``` again to download additional packages for electron
4. run ```npm start``` to start the Electron client
