'use strict';


var map;
var destinationMarker;
var driverMarker;
var activeWayPointId;

function orderUpdateCb(order) {
  console.log('orderUpdateCb: ' + JSON.stringify(order));
  addToLogContainer('Order Updated: see console for more info');
  var wayPoint = _.find(order.way_points, {id: activeWayPointId});
  var destination = new google.maps.LatLng(wayPoint.lat, wayPoint.lng);

  if(destinationMarker){
    destinationMarker.setPosition(destination);
  }else{
    destinationMarker = new google.maps.Marker({
      position: destination,
      map: map,
      icon: 'pin_destination.png'
    });
  }

  resizeMapByMarkers();
}

function locationUpdateCb(location) {
  addToLogContainer('Location Updated: ' + JSON.stringify(location));
  console.log('locationUpdateCb: ' + JSON.stringify(location));
  if (location.lat() && location.lng() && map) {
    // do something with location here
    var driverPosition = new google.maps.LatLng(location.lat(), location.lng());

    //move the marker
    if (driverMarker) {
      driverMarker.setPosition(driverPosition);
    } else {
      driverMarker = new google.maps.Marker({
        position: driverPosition,
        map: map,
        icon: 'pin_delivery.png'
      });
    }
    resizeMapByMarkers();
  }
}

function etaUpdateCb(eta) {
  console.log('etaUpdateCb: ' + eta);
  addToLogContainer('ETA Updated: ' + eta);
  // can do something with eta here
}

function onTaskRatedCb() {
  console.log('onTaskRatedCb');
  addToLogContainer('Task Rated');
  // task rated successfully!
  // we can call BringgSDK.disconnect() for example.
}

function onTaskEndedCb() {
  console.log('onTaskEndedCb');
  addToLogContainer('Task Ended');
  // task ended
  // we can call BringgSDK.disconnect() if we are not using a rating screen for example.
}

// example of watch order with order_uuid and share_uuid
function onConnectByOrderUuidAndAccessToken() {
  console.log('onConnect');
  addToLogContainer('Connected');
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
}

function addToLogContainer(value) {
  $('#logsContainer').append('<div class="log-item">' + value + '</div>');
}

function onLoad() {
  $('#requestPhone').click(function () {
    var order_uuid = $('#order_uuid').val();
    var share_uuid = $('#share_uuid').val();

    if (!order_uuid || !share_uuid) {
      alert('please fill connectiont params')
      return;
    }

    BringgSDK.getDriverPhone(share_uuid, '', function (result) {
      if (result.status === 'ok') {
        addToLogContainer('Driver Phone Received: ' + result.phone_number);
      } else {
        addToLogContainer('FAILED Getting Driver Phone Received: ' + result.message);
      }
    });
  });

  $('#connectButton').click(function () {
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
    var accessToken = $('#customer_access_token').val();

    // can use any combination of 2 from the following.
    // i.e for example can uncomment the access_token and comment out the share uuid or order uuid.
    var watchOrderParams = {
      order_uuid: $('#order_uuid').val(),
      share_uuid: $('#share_uuid').val()
    };

    if (accessToken) {
      watchOrderParams.access_token = accessToken;
    }

    BringgSDK.connect(accessToken, function () {
      console.log('onConnect');
      addToLogContainer('Connected');
      BringgSDK.watchOrder(watchOrderParams, function (result) {
        console.log('watch order result: ' + JSON.stringify(result));
        if (result.success === true) {
          addToLogContainer('WatchOrderSuccess');
          activeWayPointId = parseInt(result.shared_location.way_point_id);
        } else {
          addToLogContainer('Failed to watch order reason: ' + result.error);
        }
      });
    }, function () {
      console.log('onDisconnect');
      addToLogContainer('Disconnected');
    });
  })
}

function resizeMapByMarkers() {
  if(!map){
    return;
  }

  var latlngbounds = new google.maps.LatLngBounds();
  if(driverMarker){
    latlngbounds.extend(driverMarker.getPosition());
  }

  if (destinationMarker) {
    latlngbounds.extend(destinationMarker.getPosition());
  }

  if(driverMarker && destinationMarker){
    map.fitBounds(latlngbounds);
    map.setZoom(map.getZoom() - 1);
  }

  map.setCenter(latlngbounds.getCenter());
}