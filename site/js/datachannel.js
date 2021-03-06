/**
 * @author <a href="mailto:soulinlove541@gmail.com">Henry Hung Yu Chen</a>
 * @version 1.0
 * @copyright Hung Yu Chen 2013
 */

/**
 * Create a new RTCManager which manages webrtc peer connections and data channels.
 * @constructor
 */
function RTCManager() {
    var rtcList = {};

    this.addRTC = function (id,rtc) {
        rtcList[id] = rtc;
    };

    this.updateRTC = function (id,npc,ndc) {
        if(rtcList[id]){
            if(npc) rtcList[id].pc = npc;
            if(ndc) rtcList[id].dc = ndc;
        }
    }

    this.removeRTC = function (id) {
        rtcList[id] = null;
    };

    this.clearRTC = function () {
        rtcList = {};
    };

    this.getPC = function (id) {
        if(rtcList[id]) { return rtcList[id].pc; }
        else { return null; }
    };

    this.getDC = function (id) {
        if(rtcList[id]) { return rtcList[id].dc; }
        else { return null; }
    };
}

/**
 * Create a new ChatService.
 * @constructor
 */
function ChatService(board) {
    var selfId,
        ws = new WebSocket('ws://140.113.88.126:9000/'),
        rtcManager = new RTCManager(), // for rtc peerconnection and datachannel
        nodeList = [],
        RTC = (window.RTCSessionDescription)? RTCForChrome:RTCForFirefox,
        RTCSessionDescription = window.RTCSessionDescription || mozRTCSessionDescription,
        RTCIceCandidate = window.RTCIceCandidate || mozRTCIceCandidate,
        messageBoard = board;

    ws.onopen = function () {
        console.log('ws: server connected');
    };

    ws.onmessage = function (message) {
        var json = JSON.parse(message.data);
        console.log('ws: received event: ' + json.event);
        if(json.event == 'init') {
            selfId = json.id;
            nodeList = json.list;
            displayMessage('[System]: Your id is '+selfId);
            if(nodeList.length > 1) createMultipleRTC();
        } else if(json.event == 'receive_offer') {
            rtcManager.addRTC(json.from,RTC('answerer',json,json.from));
        } else if(json.event == 'receive_answer') { // only offerer can receive this event
            rtcManager.getPC(json.from).setRemoteDescription(new RTCSessionDescription(json.sdp));
        } else if(json.event == 'receive_ice_candidate') {
            var candidate = new RTCIceCandidate(json.candidate);
            rtcManager.getPC(json.from) && rtcManager.getPC(json.from).addIceCandidate(candidate);
        } else if(json.event == 'update_node_list') {
            nodeList = json.list;
        }
    };

    ws.onerror = function (err) {
        console.log('ws: error: ' + err);
    };

    ws.onclose = function (data) {
        console.log('ws: server disconnected');
    };

    this.rtcSend = function (msg) {
        var dc;
        for (var i = nodeList.length - 1; i >= 0; i--) {
            dc = rtcManager.getDC(nodeList[i])
            if(dc) dc.send(msg);
        };
    }

    this.getSelfId = function () {
        return selfId;
    }

    /**
     * Display message on the web page.
     * @param  {String} message
     */
    function displayMessage (message) {
        messageBoard.addLI(message);
    }

    /**
     * Create multiple webrtc connections. This function can only be called by an offerer-role node.
     */
    function createMultipleRTC() {
        for (var i = nodeList.length - 1; i >= 0; i--) {
            if(nodeList[i] != selfId) rtcManager.addRTC(nodeList[i],RTC('offerer','',nodeList[i]));
        }
    }

    /**
     * Create a new RTC for Chrome.
     * @constructor
     * @param   {String}  role     The role(offerer or answerer) of this node.
     * @param   {Object}  json     Json object which contains the session description string.
     * @param   {Number}  targetid The id of the opposite side.
     * @return  {Object}  An object contains peer connection and data channel.
     */
    function RTCForChrome(role, json, targetid) {
        var iceServers = {
                iceServers: [{
                    url: 'stun:stun.l.google.com:19302'
                }]
            },
            optionalRtpDataChannels = {
                optional: [{
                    RtpDataChannels: true
                }]
            },
            mediaConstraints = {
                optional: [],
                mandatory: {
                    OfferToReceiveAudio: false,
                    OfferToReceiveVideo: false
                }
            },
            rtcPeerConnection = new webkitRTCPeerConnection(iceServers, optionalRtpDataChannels),
            rtcDataChannel = rtcPeerConnection.createDataChannel('RTCDataChannel', {}); // { reliable: false }

        if(role == 'answerer') {
            offerSDP = new RTCSessionDescription(json.sdp);
            rtcPeerConnection.setRemoteDescription(offerSDP);

            rtcPeerConnection.createAnswer(function (sessionDescription) {
                rtcPeerConnection.setLocalDescription(sessionDescription);
                ws.send(JSON.stringify({
                    'event': 'send_answer',
                    'to': json.from,
                    'sdp': sessionDescription
                }));
            }, null, mediaConstraints);
        } else {
            rtcPeerConnection.createOffer(function (sessionDescription) {
                rtcPeerConnection.setLocalDescription(sessionDescription);
                ws.send(JSON.stringify({
                    'event': 'send_offer',
                    'to': targetid,
                    'sdp': sessionDescription
                }));
            }, null, mediaConstraints);
        }

        rtcPeerConnection.onicecandidate = function (event) {
            if (!event || !event.candidate) { return; }
            console.log('rtc: onicecandidate');
            ws.send(JSON.stringify({
                'event': 'send_ice_candidate',
                'to': targetid,
                'candidate': event.candidate
            }));
        };

        rtcPeerConnection.ondatachannel = function (event) {
            console.log('rtc: data channel is connecting...');
        };

        rtcDataChannel.onopen = function () {
            console.log('rtc: data channel has opened');
            this.send('['+selfId+']: hi, I am '+selfId);
        };

        rtcDataChannel.onclose = function () { // seems to be useless
            console.log('rtc: data channel has closed');
            this.send(selfId + ' has leaved the chat');
        };

        rtcDataChannel.onmessage = function (event) {
            console.log('rtc: receive message: '+event.data);
            displayMessage(event.data);
        };

        return {
            'pc': rtcPeerConnection,
            'dc': rtcDataChannel
        };
    }

    /**
     * Create a new RTC for Firefox
     * @constructor
     * @param   {String}  role     The role(offerer or answerer) of this node.
     * @param   {Object}  json     Json object which contains the session description string.
     * @param   {Number}  targetid The id of the opposite side.
     * @return  {Object}  An object contains peer connection and data channel.
     */
    function RTCForFirefox(role, json, targetid) {
        var iceServers = {
                iceServers: [{
                    url: 'stun:23.21.150.121'
                }]
            },
            mediaConstraints = {
                optional: [],
                mandatory: {
                    OfferToReceiveAudio: false,
                    OfferToReceiveVideo: false
                }
            },
            rtcPeerConnection = new mozRTCPeerConnection(iceServers),
            rtcDataChannel;

        if(role == 'answerer') {
            offerSDP = new mozRTCSessionDescription(json.sdp);
            rtcPeerConnection.setRemoteDescription(offerSDP);
            rtcPeerConnection.createAnswer(function (sessionDescription) {
                rtcPeerConnection.setLocalDescription(sessionDescription);
                ws.send(JSON.stringify({
                    'event': 'send_answer',
                    'to': json.from,
                    'sdp': sessionDescription
                }));
            }, useless, mediaConstraints);

        } else {
            rtcDataChannel = rtcPeerConnection.createDataChannel('RTCDataChannel', {});
            rtcPeerConnection.createOffer(function (sessionDescription) {
                rtcPeerConnection.setLocalDescription(sessionDescription);
                ws.send(JSON.stringify({
                    'event': 'send_offer',
                    'to': targetid,
                    'sdp': sessionDescription
                }));
            }, useless, mediaConstraints);

            setupRTCDataChannel();
        }

        rtcPeerConnection.onicecandidate = function (event) {
            console.log('rtc: onicecandidate');
        };

        rtcPeerConnection.ondatachannel = function (event) {
            console.log('rtc: data channel is connecting...');
            if(role == 'answerer'){
                rtcDataChannel = event.channel;
                rtcManager.updateRTC(targetid,null,rtcDataChannel);
                setupRTCDataChannel();
            }
        };

        function setupRTCDataChannel(){
            rtcDataChannel.onopen = function () {
                console.log('rtc: data channel has opened');
                this.send('['+selfId+']: hi, I am '+selfId);
            };

            rtcDataChannel.onclose = function () { // seems to be useless
                console.log('rtc: data channel has closed');
                this.send(selfId + ' has leaved the chat');
            };

            rtcDataChannel.onmessage = function (event) {
                console.log('rtc: receive message: '+event.data);
                displayMessage(event.data);
            };
        }

        function useless() {}

        return {
            'pc': rtcPeerConnection,
            'dc': rtcDataChannel
        };
    }

}