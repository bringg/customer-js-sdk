'use strict';
 
 
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

function onConnectByOrderUuidAndShareUuid(){
    console.log('onConnect');
    BringgSDK.watchOrder({
    order_uuid: DemoConfig.order_uuid,
    share_uuid: DemoConfig.share_uuid
    }, function (result) {
    console.log('watch order result: ' + JSON.stringify(result));
    if (result && result.shared_location) {
        console.log('calling init bringg with ' + result.share_uuid);
        BringgSDK.initializeBringg({share_uuid: result.share_uuid}, onBringgInitSuccess, onBringgInitFailed);
    }
    });
//      alternatively here is an example for using share_uuid directly if you have it
//      BringgSDK.initializeBringg({share_uuid: PLACE_YOUR_SHARED_LOCATION_UUID_HERE}, onBringgInitSuccess, onBringgInitFailed);
}

// example of watch order without order uuid
function onConnectByCustomerAndShareUuid(){
    console.log('onConnect');
    BringgSDK.watchOrder({
    access_token: DemoConfig.customer_access_token,
    share_uuid: DemoConfig.share_uuid
    }, function (result) {
    console.log('watch order result: ' + JSON.stringify(result));
    if (result && result.shared_location) {
        console.log('calling init bringg with ' + result.share_uuid);
        BringgSDK.initializeBringg({share_uuid: result.share_uuid}, onBringgInitSuccess, onBringgInitFailed);
    }
    });
}

function onBringgInitSuccess(configuration){
    console.log('initializeBringg success');
    console.log(configuration);

    // here we can do something with result.shared_location like storing it
    // in case we want to use the extra data later.
}

function onBringgInitFailed(error){
    console.log('initializeBringg failed. error:' + error);
}

var map;
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: -34.397, lng: 150.644},
    zoom: 8
    });

    // example for connection using order uuid and share uuid
    BringgSDK.connect(DemoConfig.customer_access_token, onConnectByOrderUuidAndShareUuid);

    // example for connection without order uuid
    //BringgSDK.connect(DemoConfig.customer_access_token, onConnectByCustomerAndShareUuid);

    // example for setting callbacks directly
    BringgSDK.setLocationUpdateCb(locationUpdateCb);
    BringgSDK.setETAUpdateCb(etaUpdateCb);
    BringgSDK.setOrderUpdateCb(orderUpdateCb);

    // example for setting callbacks implicitly
    BringgSDK.setEventCallback({
    'taskRatedCb': onTaskRatedCb,
    'taskEndedCb': onTaskEndedCb
    });
}