'use strict';
 
 
var map;

function orderUpdateCb(order){
    console.log('orderUpdateCb: ' + JSON.stringify(order));
    // do something with order here
}

function locationUpdateCb(location){
    console.log('locationUpdateCb: ' + JSON.stringify(location));
    if (location.lat() && location.lng() && map){
        // do something with location here
        var center = new google.maps.LatLng(location.lat(), location.lng());
        map.panTo(center);
    }
}

function etaUpdateCb(eta){
    console.log('etaUpdateCb');
    console.log(eta);
    // can do something with eta here
}

function onTaskRatedCb(){
    console.log('onTaskRatedCb');
    // task rated successfully!
    // we can call BringgSDK.disconnect() for example.
}

function onTaskEndedCb(){
    console.log('onTaskEndedCb');
    // task ended
    // we can call BringgSDK.disconnect() if we are not using a rating screen for example.
}

// example of watch order with order_uuid and share_uuid
function onConnectByOrderUuidAndAccessToken(){
    console.log('onConnect');
    BringgSDK.watchOrder({
        order_uuid: DemoConfig.order_uuid,
        access_token: DemoConfig.customer_access_token
    }, function (result) {
        console.log('watch order result: ' + JSON.stringify(result));
    });
}

function initMap() {
    // init ui
    map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: -34.397, lng: 150.644},
        zoom: 8
    });

    // example for setting callbacks directly
    BringgSDK.setLocationUpdateCb(locationUpdateCb);
    BringgSDK.setETAUpdateCb(etaUpdateCb);
    BringgSDK.setOrderUpdateCb(orderUpdateCb);

    // example for setting callbacks implicitly
    BringgSDK.setEventCallback({
        'taskRatedCb': onTaskRatedCb,
        'taskEndedCb': onTaskEndedCb
    });

    // customer_access_token may be null or undefined.
    var accessToken = DemoConfig.customer_access_token;

    // can use any combination of 2 from the following.
    // i.e for example can uncomment the access_token and comment out the share uuid or order uuid.
    var watchOrderParams = {
        order_uuid: DemoConfig.order_uuid,
        share_uuid: DemoConfig.share_uuid
        // access_token: DemoConfig.customer_access_token
    };

    BringgSDK.connect(accessToken, function() {
        console.log('onConnect');
        BringgSDK.watchOrder(watchOrderParams, function (result) {
            console.log('watch order result: ' + JSON.stringify(result));
        });
    }, function() {
        console.log('onDisconnect');
    });
}