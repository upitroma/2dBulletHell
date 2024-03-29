//Make connection
var socket = io.connect(window.location.href);//change to server's location for electron

//TODO: var for overall size of the game

var uploadrate=0 //slow for lag testing, will be set to 0

var playerSpeedNormal=300 //must be same as server side

const snapDist=100//local snap distance

//get html assets
var canvas = document.getElementById('canvas'),
    context = canvas.getContext('2d')


//define objects


class OtherPlayer{
    constructor(x,y){
        this.isActive=true
        this.x=x
        this.y=y

        this.sx=x
        this.sy=y
    }
}

class Me{
    constructor(){
        this.x=100
        this.y=100
        this.isConnected=false
        this.visibleWalls=[]
        this.visiblePlayers=[]
        this.keybindings={
            up: 87,
            down: 83,
            left: 65,
            right: 68
        }
    }
    render(){
        context.fillStyle = "blue"
        context.strokeStyle="blue"
        context.beginPath();
        context.moveTo((canvas.width/2)+10,(canvas.height/2))
        context.arc((canvas.width/2), (canvas.height/2), 10, 0, 2 * Math.PI);
        context.closePath();
        context.fill();
        context.stroke();
    }
}
var me=new Me()


class Wall{
    constructor(x,y,width,height,color="#f403fc"){
        this.x=x
        this.y=y
        this.width=width
        this.height=height
        this.color=color
    }
    render(px,py){
        context.fillStyle=this.color
        
        //context.fillRect((canvas.width/2)+this.x1-px,(canvas.height/2)+this.y1-py,this.x1-this.x2,this.y2-this.y1, this.color)
        context.fillRect((canvas.width/2)+this.x-px,(canvas.height/2)+this.y-py,this.width,this.height, this.color)
        context.stroke();
    }
}
const wallTest = new Wall(1000,2100,300,300)
me.visibleWalls=[wallTest]


//handle inputs-----------------------------
var keys = [];
window.onkeyup = function(e) { keys[e.keyCode] = false; }
window.onkeydown = function(e) { keys[e.keyCode] = true;} 
keys[87]=keys[83]=keys[68]=keys[65]=keys[76]=keys[75]=false

//canvas setup----------------------------
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

//graphics--------------
BG=new Image()
//BG.src="backgroundTest.jpg"
function drawBackground(){
    context.fillStyle = "black"
    context.fillRect(0, 0, canvas.width, canvas.height); 

    context.drawImage(BG,me.x-(canvas.width/2),me.y-(canvas.height/2),canvas.width,canvas.height,0,0,canvas.width,canvas.height)
}

//https://gamedev.stackexchange.com/questions/114898/frustum-culling-how-to-calculate-if-an-angle-is-between-another-two-angles
function deltaAngle(px,py,pa,objx,objy){
    var l1x=objx-px
    var l1y=objy-py
    var l1mag=Math.sqrt((l1x*l1x) + (l1y*l1y))
    var l2x=Math.cos(pa)
    var l2y=Math.sin(pa)
    var dot=(l1x*l2x) + (l1y*l2y)
    var deltaAngle=Math.acos(dot/l1mag)
    return deltaAngle
}




//game logic------------------------------------


//update loop------------------------------------
var uploadtimer=0
window.onload = function(){

    
    
    function update(deltatime){

        //move players locally
        moveMe(deltatime)
        moveOthers(deltatime)

        //dynamically resize screen--------
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        drawBackground()

        //no need to slow down unconnected clients
        if(me.isConnected){
            uploadtimer+=deltatime
            if(uploadtimer>uploadrate){
                updatePlayer()
                uploadtimer=0                
            }

            


            //render self
            //TODO: translate absolute coords to relative(to screen size)
            me.render()
            

            //render others
            me.visiblePlayers.forEach(function(vp){
                if(vp.isActive){
                    context.fillStyle = 'red'
                    context.strokeStyle="red"
                    context.beginPath();
                    context.moveTo((canvas.width/2)+vp.x-me.x+10,(canvas.height/2)+vp.y-me.y)
                    context.arc((canvas.width/2)+vp.x-me.x, (canvas.height/2)+vp.y-me.y, 10, 0, 2 * Math.PI);
                    context.closePath();
                    context.fill();
                    context.stroke();
                }   
            })
            context.stroke();

            //render visible walls
            me.visibleWalls.forEach(function(w){
                w.render(me.x,me.y)
            })
            //context.fillStyle = "red"
            //context.strokeStyle="blue"    
        
        }

        context.stroke();
 
    }

    //tick----------------
    
    //https://stackoverflow.com/questions/13996267/loop-forever-and-provide-delta-time
    var lastTick = performance.now()
    function tick(nowish) {
        var delta = nowish - lastTick
        lastTick = nowish
        delta/=1000 //ms to s
        update(delta)
        window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
}


function moveMe(deltaTime){


    
    //TODO: use absolute coords
    var deltaY = (
        keys[me.keybindings.down]*playerSpeedNormal*deltaTime
        - keys[me.keybindings.up]*playerSpeedNormal*deltaTime
    )
    var deltaX=(
        keys[me.keybindings.right]*playerSpeedNormal*deltaTime
        - keys[me.keybindings.left]*playerSpeedNormal*deltaTime
    )

    angle = Math.atan2(deltaY, deltaX);

    deltaX=(Math.cos(angle))*playerSpeedNormal*deltaTime*(keys[me.keybindings.right]||keys[me.keybindings.left])
    deltaY=(Math.sin(angle))*playerSpeedNormal*deltaTime*(keys[me.keybindings.down]||keys[me.keybindings.up])

    //check collision with walls
    me.visibleWalls.forEach(function(w){
        //if player would be inside a wall


        if(w.y<me.y && w.y+w.height>me.y){
            if(w.x<me.x+deltaX && w.x+w.width>me.x+deltaX){
                deltaX=0
            }

        }
        if(w.x<me.x && w.x+w.width>me.x){
            if(w.y<me.y+deltaY && w.y+w.height>me.y+deltaY){
                deltaY=0
            }
        }

    });

    

    me.x+=deltaX
    me.y+=deltaY
    //TODO: collision
    //TODO: stop from going off screen
    
}
function moveOthers(deltaTime){

    
    me.visiblePlayers.forEach(function(p){



        

        //if player gets too far away, snap them to the correct position
        //FIXME should be circular, not square
        if(Math.abs(p.sx-p.x) > snapDist){
            p.x=p.sx
            p.y=p.sy
        }    
        if(Math.abs(p.sy-p.y) > snapDist){
            p.x=p.sx
            p.y=p.sy
        }


        interpolate(p,deltaTime)
        //p.x=p.sx
        //p.y=p.sy
    })
}


function interpolate(p,deltaTime){
    targetDeltaX=p.sx-p.x
        targetDeltaY=p.sy-p.y
        maxDeltaPosition=playerSpeedNormal*deltaTime*1.1

        
        if(Math.abs(targetDeltaX)>maxDeltaPosition){
            if(targetDeltaX<0){
                targetDeltaX=-maxDeltaPosition
            }
            else{
                targetDeltaX=maxDeltaPosition
            }
        }
        p.x+=targetDeltaX
        
        
        if(Math.abs(targetDeltaY)>maxDeltaPosition){
            if(targetDeltaY<0){
                targetDeltaY=-maxDeltaPosition
            }
            else{
                targetDeltaY=maxDeltaPosition
            }
        }
        p.y+=targetDeltaY
}


//networking out---------------------------

//emmit events

function updatePlayer(){
    p=me
    socket.emit("playerData",{
        //translate to absolute coordinates
        x: p.x,
        y: p.y,
        up: keys[me.keybindings.up],
        down: keys[me.keybindings.down],
        left: keys[me.keybindings.left],
        right: keys[me.keybindings.right],
    });
}


//networking in---------------------------

socket.on("serverPrivate",function(data){//server connection
    console.log("serverPrivate "+data)
    me.isConnected=true
});

socket.on("serverTp",function(data){//server connection
    console.log("server Tp "+data.x+" "+data.y)
    me.x=data.x
    me.y=data.y
    me.isConnected=true
});

socket.on("testPositionUpdator",function(data){//server connection

    for(i=0;i<data.length;i++){
        if(typeof me.visiblePlayers[data[i].id] != "undefined"){
            me.visiblePlayers[data[i].id].sx=data[i].x
            me.visiblePlayers[data[i].id].sy=data[i].y
            me.visiblePlayers[data[i].id].isActive=true
        }
        else{
            me.visiblePlayers[data[i].id]=new OtherPlayer(data[i].x, data[i].y)
            
        }
    }
});


socket.on("forceSnapPosition",function(data){
    me.x=data.x
    me.y=data.y

    //player must acknowledge the snap before the server will let them move
    p=me
    socket.emit("playerData",{
        //translate to absolute coordinates
        x: p.x,
        y: p.y,
        up: keys[me.keybindings.up],
        down: keys[me.keybindings.down],
        left: keys[me.keybindings.left],
        right: keys[me.keybindings.right],
    });
    console.log("ah snap!")
});

socket.on("imageLoad", function(data) {
    if(data.name="bg"){
        BG.src = 'data:image/jpeg;base64,' + data.buffer;
    }
});



socket.on("serverMessage",function(data){
    console.log(data)
})

socket.on("serverPlayerDisconnect",function(data){
    me.visiblePlayers[data].isActive=false
    //TODO: remove player from array
    //FIXME: it dosen't work
})
socket.on("IdleDisconnect",function(){
    alert("the server has disconnected you for being idol")
})


