var express = require("express")
var socket = require("socket.io")

//app setup
var app = express();
var server = app.listen(4000,function(){
    console.log("Server is up on http://"+getIp()+":4000")
});

//static files
app.use(express.static("public"))

//host tracking
class Host{
    constructor(socket){
        this.socket=socket
        this.id=socket.id//ok, maybe a bit redundant
        this.joinCode=generateHostId()
        this.isActive=true
        this.playerSockets=[]
    }
}
class client{
    constructor(socket,hostSocket){
        this.socket=socket
        this.joinCode=-1
        this.hostSocket=hostSocket
    }
}


var hostLookup=[]
var hostJoinCodeLookup=[]

var clientLookup=[]

//socket setup
var io = socket(server)

var clientId=0
var lookup=[]
var isActiveLookup=[]

//useful source
//https://gist.github.com/alexpchin/3f257d0bb813e2c8c476


io.on("connection",function(socket){
    socket.id=clientId++
    lookup[socket.id]=socket
    isActiveLookup[socket.id]=true
    lookup[socket.id].emit("serverPrivate",socket.id)
    console.log("client connected on socket: ",socket.id +" Current active sockets: "+getTotalActiveSockets())
    
    io.sockets.emit("serverMessage","new connection on socket: "+socket.id+". Current active sockets: "+getTotalActiveSockets())
    
    io.sockets.emit("newPlayer",{
        random: Math.random(),
        id: socket.id
    });

    //listen for data

    socket.on("hostToSingleClient",function(data){
        if(clientLookup[data.targetId]!=null){
            clientLookup[data.targetId].socket.emit("hostToSingleClient",data)
        }
    });

    socket.on("clientToHost",function(data){
        if(hostJoinCodeLookup[data.joinCode]!=null){
            hostJoinCodeLookup[data.joinCode].socket.emit("clientToHost",{
                playerId: socket.id,
                walkForward: data.walkForward,
                walkBackward: data.walkBackward,
                walkRight: data.walkRight,
                walkLeft: data.walkLeft,
                turnRight: data.turnRight,
                turnLeft: data.turnLeft
            })
        }
    });

    socket.on("BecomeHost",function(data){
        if(hostLookup[socket.id]==null){//new socket
            hostLookup[socket.id]=new Host(socket)
            lookup[socket.id].emit("ServerToHost",hostLookup[socket.id].joinCode)
            hostJoinCodeLookup[hostLookup[socket.id].joinCode]=hostLookup[socket.id]//easier to look up by joinId
        }
        else{
            lookup[socket.id].emit("ServerToHost","you are already hosting")
        }
    });

    socket.on("joinHost",function(data){
        if(hostJoinCodeLookup[data]!=null){
            if(hostJoinCodeLookup[data].isActive){
                lookup[socket.id].emit("serverMessage","Found host on "+data)

                //keep track of player
                clientLookup[socket.id]=new client(socket,data)

                //connect player to correct host
                //hostJoinCodeLookup[data].playerSockets.push(socket.id)
                hostJoinCodeLookup[data].socket.emit("ServerToHost",socket.id)
                return
            }
        }
        lookup[socket.id].emit("serverMessage","invalid join code")
    })

    socket.on('disconnect', function(){
        console.info('user disconnected from socket: ' + socket.id+" Current active sockets: "+getTotalActiveSockets());
        isActiveLookup[socket.id]=false
        io.sockets.emit("serverMessage","user disconnected on socket: "+socket.id+". Current active sockets: "+getTotalActiveSockets())
        io.sockets.emit("serverPlayerDisconnect",socket.id)
    });
});


function getIp(){
    var os = require('os');
    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    return addresses
}

function getTotalActiveSockets(){
    var total=0
    for(var i=0;i<lookup.length;i++){
        if(isActiveLookup[i]){
            total++
        }
    }
    return total
}



//security
var usedIDs=[]
function generateHostId(){
    var r = Math.floor(Math.random() * 100000)
    while (usedIDs.includes(r)){
        r = Math.floor(Math.random() * 100000)
    }
    return r
}