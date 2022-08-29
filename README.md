# customer-js-sdk

[![codecov](https://codecov.io/gh/bringg/customer-js-sdk/branch/master/graph/badge.svg)](https://codecov.io/gh/bringg/customer-js-sdk)

## Getting started

#### Install
`bower install bringg-js-sdk`

#### Dependencies
add the following to your index.html
```
<script src="bower_components/socket.io-client/socket.io.js"></script>
<script src="bower_components/bringg-sdk/BringgSDK.js"></script>
```


## API

### Main methods

##### initializaBringg (params, [initDoneCb], [initFailedCb])
optional setup function. 
params can be used to pass credentials and share uuid if you already hold a reference to it.

`params`:
```
{
  [optional]customer_access_token: ""   // needed if share_uuid is not provided.
  [optional]share_uuid: "",             // needed if customer_access_token is not provided.
}
```

`if the params include a valid share_uuid, the sdk will automatically connect and preform the whole tracking flow
using watch order and watch driver on the relevant order and driver).`


##### connect ([customerAccessToken],[onConnectCb],[onDisconnectCb])
connect to the realtime.

connection callbacks are optional since you can independently set the onConnect/onDisconnect via setter functions.

the access token is also optional at this point.

Deprecation Notice: In the next versoins, calling connect without calling to `initializeBringg` with `token` (Developer Access Token).


##### disconnect()
closes the real-time connection.


##### watchOrder(params, callback)
start tracking an order

`params`:
```
{
  order_uuid: "",
  share_uuid: "",
  [optional]way_point_id: ""
}
```

`after calling this method there is no need to call the watchDriver and watchWaypoint as the sdk will figure by himself
when it can do so. see setAutoWatchDriver and setAutoWatchWayPoint if you want to call them manually.`



##### watchDriver(params, callback)

`params`:
```
{
  driver_uuid: "",
  share_uuid: ""
}
```

##### watchWayPoint(params, callback)

`params`:
```
{
  order_uuid: "",
  way_point_id: ""
}
```


### Additional optional actions
these actions use the tokens and urls aquired by the shared_location configuration.

##### submitRating(rating)
submit rating from the customer.

##### submitRatingReason(ratingReasonId)
submit rating reason after the customer rated (for example you can prompt him for his reason if he rated below 2/5).

##### submitNote(note).
send a note by the customer.

##### submitLocation(position, successCb, failureCb)
send the customer current location.

### setting callbacks

##### setConnectionCallbacks(onConnectCb, onDisconnectCb)
you can pass the callbacks to the connect() method instead.

##### setOrderUpdateCb(cb)
you can pass the callback to the watchOrder() method instead.

##### setLocationUpdateCb(cb)
you can pass the callback to the watchDriver instead.
note that if you instead let the sdk call it for you, you must pass the callback in order to receive location updates.

the result of this callback is the following object: https://developers.google.com/maps/documentation/javascript/reference/coordinates

##### setETAUpdateCb(cb)

##### setETAMethodChangedCb(cb)


### optional setters

##### setDestination(lat, lng)
set the destination for the order (i.e the customer's location).
`the destination is needed for eta calculations.`
`to get eta calculation, you must either use this method or use initializeBringg with a share_uuid`

##### setConfiguration(sharedLocationConfiguration)
usually once the sdk is provided with a share_uuid it obtains the necessary configuration for itself.
if however you do not have a share_uuid but have the configuration ou can set it yourself manually.

##### setETAMethod(newETAMethod)

##### setDebug(value)
when running in debug mode, the app will log useful information to the console for debugging purposes.
the `value` param should be a Boolean, either `true` or `false`.

### other

##### getLastKnownETA()
you can set use the setETAUpdateCb to receive eta updates instead.

##### setAutoWatchDriver(enable)
by default the sdk will start watching driver when driver location should be availble.
you can turn this on/off if using enable=true/false respectively.

##### setAutoWatchWayPoint(enable)
by default the sdk will NOT watch state change of way points.
you can turn this on/off if using enable=true/false respectively.


## Examples


### for an example of using our sdk with a simple google map see the customer-sdk-demo.html file attached
##### don't forget you need to follow installation steps.
##### don't forget to set your own keys and params.


### here are few separated examples for commonly used scenarios
##### This shows how to initialize and do a whole tracking experience using a provided share_uuid
```
BringgSDK.initializeBringg({share_uuid: YOUR_SHARE_UUID}, function(updatedConfiguration){
    // initialization succeeded
}, function(error){
    // initialization failed
};
```

##### This shows how to watch order manually
```
var customer_access_token = 'YOUR_CUSTOMER_ACCESS_TOKEN'; // may be null 
var my_order_uuid = 'SOME_UUID_HERE';
var my_share_uuid = 'ANOTHER_UUID';
var my_active_way_point_id = 'SOME ID';

function orderUpdateCb(order){
  // do something with order here
}

function locationUpdateCb(location){
  if (location.lat() && location.lng()){
    // do something with location here
  }
}

function etaUpdateCb(eta){
  // can do something with eta here
}

function onTaskRatedCb(){
  // task rated successfully!
  // we can call BringgSDK.disconnect() for example.
}

function onConnect(){
   BringgSDK.watchOrder({
          order_uuid: my_order_uuid,
          way_point_id: my_way_point_id,  
          share_uuid: my_share_uuid       // can be null if you connected with the customer_access_token.
        }, function (result) {
          if (result && result.shared_location) {
            // here we can do something with result.shared_location like storing it
            // in case we want to use the extra data later.
          }
        });
}

// beside 
BringgSDK.connect(customer_access_token, onConnect);

// example for setting callbacks directly
BringgSDK.setLocationUpdateCb(locationUpdateCb);
BringgSDK.setETAUpdateCb(etaUpdateCb);
BringgSDK.setOrderUpdateCb(orderUpdateCb);

// example for setting callbacks implicitly
BringgSDK.setEventCallback({
  'taskRatedCb': onTaskRatedCb              // callback for action: submitRating
  'taskPostRatedCb': onTaskPostRatedCb      // callback for action: submitRatingReason
  'noteAddedCb': onNoteAddedCb              // callback for action: submitNote
  'driverArrivedCb': onDriverArrivedCb      // gets called when driver arrived to the destination address.
  'driverLeftCb': onDriverLeftCb            // gets called when driver left the customer's address (e.g waypoint was done) and rating is required.
  'taskEndedCb': onTaskEndedCb              // gets called when task has ended (e.g waypoint was done) and no rating (or further actions) are required.
  'etaUpdateCb': onEtaUpdateCb              // callback for receiving eta updates. can use setETAUpdateCb instead.
  'locationUpdateCb': onLocationUpdateCb    // callback for receiving location updates. can use setLocationUpdateCb instead.
});

```

### Other tips and tricks
##### disabling CORS while testing on localhost
`open -a Google\ Chrome --args --disable-web-security --user-data-dir`
