# customer-js-sdk


## getting started

#### install
`bower install bringg-js-sdk`

#### dependencies
please add the following to your index.html
```
<script src="bower_components/socket.io-client/socket.io.js"></script>
<script src="bower_components/bringg-sdk/BringgSDK.js"></script>
```


## api

### main methods

##### initializaBringg (params, [initDoneCb])
optional setup function. 
params can be used to pass credentials and share uuid if you already hold a reference to it.

`params`:
```
{
  customer_access_token: ""
  [optional]share_uuid: "",
  [optional]order_uuid: "",
}
```

`if params include share_uuid, after fetching the shared-location config the sdk will automatically connect the realtime`

`if the params include the necessary data for watchOrder, it will be called automatically when realtime connection is established.`


##### connect ([customerAccessToken],[onConnectCb],[onDisconnectCb])
connect to the realtime.

connection callbacks are optional since you can independently set the onConnect/onDisconnect via setter functions.

the access token is also optional at this point.


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

`after calling this method there is no need to call the watchDriver and watchWaypoint as the sdk will figure by himself when it can do so. see setAutoWatchDriver and setAutoWatchWayPoint if you want to call them manually.`



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


### additional optional actions
these actions use the tokens and urls aquired by the shared_location configuration.

##### submitRating(rating)
submit rating from the customer.

##### submitRatingReason(ratingReasonId)
submit rating reason after the customer rated (for example you can prompt him for his reason if he rated below 2/5).

##### submitNote(note).
send a note by the customer.

##### submitLocation(position, successCb, failureCb)
send the customer current location.

##### submitTip(tip)
send the tip amount that the customer decides to add.

### setting callbacks

##### setConnectionCallbacks(onConnectCb, onDisconnectCb)
you can pass the callbacks to the connect() method instead.

##### setOrderUpdateCb(cb)
you can pass the callback to the watchOrder() method instead.

##### setLocationUpdateCb(cb)
you can pass the callback to the watchDriver instead.
note that if you instead let the sdk call it for you, you must pass the callback in order to receive location updates.

##### setETAUpdateCb(cb)

##### setETAMethodChangedCb(cb)


### optional setters

##### setDestination(lat, lng)
set the destination for the order (i.e the customer's location).
`the destination is needed for eta calculations.`

##### setConfiguration(sharedLocationConfiguration)
usually once the sdk is provided with a share_uuid it obtains the necessary configuration for itself.
if however you do not have a share_uuid but have the configuration ou can set it yourself manually.

##### setETAMethod(newETAMethod)


### other

##### getLastKnownETA()
you can set use the setETAUpdateCb to receive eta updates instead.

##### setAutoWatchDriver(enable)
by default the sdk will start watching driver when driver location should be availble.
you can turn this on/off if using enable=true/false respectively.

##### setAutoWatchWayPoint(enable)
by default the sdk will NOT watch state change of way points.
you can turn this on/off if using enable=true/false respectively.


## examples
##### this shows how to watch order manually
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
          share_uuid: my_share_uuid
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
  'taskRatedCb': onTaskRatedCb
});
```
