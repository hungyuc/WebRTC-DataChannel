/**
 * @author <a href="mailto:soulinlove541@gmail.com">Henry Hung Yu Chen</a>
 * @version 1.0
 * @copyright Hung Yu Chen 2013
 */

/**
 * Create a new Event Handler which manages self-defined events of server's web socket.
 * @constructor
 * @param   {Object} s  The server object.
 */
function EventHandler(s) {
    var events = {},
        server = s;

    this.on = function (eventName, callback) {
        events[eventName] = callback;
    };

    this.fire = function (eventName, _) {
        var evt = events[eventName],
            args = Array.prototype.slice.call(arguments, 1);

        if (!evt) { return; }
        evt.apply(server, args);
    };
}

/**
 * Create a new Node Manager which manages test nodes' infomation and status.
 * @constructor
 */
function NodeManager() {
    var socketList = {},
        idList = [],
        idcounter = 0;

    this.createNode = function (socket) {
        var id = idcounter;
        idcounter++;
        idList.push(id);
        socketList[id] = socket;
        return id;
    };

    this.deleteNode = function (id,f) {
        idList.splice(idList.indexOf(id),1);
        delete socketList[id];
    };

    this.getIdList = function () {
        return idList;
    }

    this.getSocket = function (id) {
        return socketList[id];
    };

    this.getSocketList = function () {
        return socketList;
    };
}

/* HTTP Server */
var app = require('express')(),
    fs = require('fs');

/* Websocket Server */
var WebSocketServer = require('ws').Server,
    server = new WebSocketServer({port: 9000}),
    eventHandler = new EventHandler(server),
    nodeManager = new NodeManager();

app.listen(8080);

app.get('/', function (req, res) {
    res.sendfile(__dirname + '/index.html');
});

app.get(/^\/.*\.js\/?$/, function (req, res) {
    var path = __dirname + '/js' + req._parsedUrl.pathname;
    fs.exists(path, function (exists) {
        if (!exists) {
            res.writeHead(404);
            return res.end('File not found')
        }
        res.sendfile(__dirname + '/js' + req._parsedUrl.pathname);
    });
});


server.on('connection', function (socket) {
    var selfId = nodeManager.createNode(socket);

    console.log('id (' + selfId + ') has connected');

    // initialization
    socket.send(JSON.stringify({
        'event': 'init',
        'id': selfId,
        'list': nodeManager.getIdList()
    }));

    updateNodeList();

    socket.on('message', function (message) {
    	var json = JSON.parse(message);
    	console.log('received event from ' + selfId + ': ' + json.event);
        eventHandler.fire(json.event,json,selfId);
    });

    socket.on('close', function (message) {
        console.log('id (' + selfId + ') has disconnected');
        nodeManager.deleteNode(selfId);
        updateNodeList();
    });

    function updateNodeList() {
        var l = nodeManager.getIdList();
        for (var i = l.length - 1; i >= 0; i--) {
            if(l[i] != selfId){
                nodeManager.getSocket(l[i]).send(JSON.stringify({
                    'event': 'update_node_list',
                    'list': l
                }));
            }
        };
    }

});

/////////////
/// Events //
/////////////
eventHandler.on('send_offer', function (json,id) {
    nodeManager.getSocket(json.to).send(JSON.stringify({
        'event': 'receive_offer',
        'from': id,
        'sdp': json.sdp
    }));
});

eventHandler.on('send_answer', function (json,id) {
    nodeManager.getSocket(json.to).send(JSON.stringify({
        'event': 'receive_answer',
        'from': id,
        'sdp': json.sdp
    }));
});

eventHandler.on('send_ice_candidate', function (json,id) {
    nodeManager.getSocket(json.to).send(JSON.stringify({
        'event': 'receive_ice_candidate',
        'from': id,
        'candidate': json.candidate
    }));
});