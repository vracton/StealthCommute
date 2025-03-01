var map;
var userLocation;
const routeLayerId = "route";
var markedLoc;
var transportMethod = "driving"

window.onload = () => {
    duoIcons.createIcons();
    mapboxgl.accessToken = 'pk.eyJ1IjoidnJhY3RvIiwiYSI6ImNtN3FkODkxNTB5YTUya3BzMzFnbmlpcW8ifQ.pYxJXLHgWiEAG2OQ16R3Cg';
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [-74.006, 40.7128],
        zoom: 12
    });

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            userLocation = [position.coords.longitude, position.coords.latitude];
            markedLoc = userLocation;

            map.setCenter(userLocation);
            const userMarker = document.createElement('div');
            userMarker.style.width = '30px';
            userMarker.style.height = '30px';
            userMarker.style.backgroundImage = 'url(https://cdn-icons-png.flaticon.com/512/684/684908.png)';
            userMarker.style.backgroundSize = 'cover';
            userMarker.style.borderRadius = '50%';

            const marker = new mapboxgl.Marker({color: "#7e87ff"});
            marker.setLngLat(userLocation).addTo(map);
        }, error => {
            console.error('Error getting user location:', error);
        });
    } else {
        console.error('Geolocation is not supported by this browser.');
    }

    let clickedMarker = null;

        map.on('click', (e) => {
            const { lng, lat } = e.lngLat;

            console.log(`Clicked location: ${lat}, ${lng}`);

            if (clickedMarker) {
                clickedMarker.remove();
            }

            clickedMarker = new mapboxgl.Marker({color: "#ff7e7e"})
                .setLngLat([lng, lat])
                .addTo(map);

            markedLoc = [lng, lat];
        });

        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl
        });

        geocoder.on('result', (e) => {
            const { result } = e;
            const { center } = result;
            markedLoc = center;
        });

        map.addControl(geocoder);
}

async function getRoute(start, destination, type="driving") {
    if (!userLocation) {
        alert("User location not found. Please allow location access.");
        return;
    }

    const query = `https://api.mapbox.com/directions/v5/mapbox/${type}/${start[0]},${start[1]};${destination[0]},${destination[1]}?geometries=geojson&access_token=${mapboxgl.accessToken}`;

    try {
        const response = await fetch(query);
        const data = await response.json();
        const route = data.routes[0];

        if (!route) {
            console.error("No route found.");
            return;
        }
        console.log(route.geometry);
        new mapboxgl.Marker({color: "#7e7e"})
            .setLngLat(route.geometry.coordinates[0])
            .addTo(map);
        new mapboxgl.Marker({color: "#ff7e2e"})
            .setLngLat(route.geometry.coordinates[route.geometry.coordinates.length-1])
            .addTo(map);
        let { distance, duration } = route;
        distance = ((distance / 1000)/1.609).toFixed(2);
        duration = Math.ceil(duration / 60);
        document.getElementById("distance").innerText = distance;
        document.getElementById("time").innerText = duration;

        const arrivalTime = new Date(new Date().getTime() + duration * 60000);
        const arrivalHours = arrivalTime.getHours().toString().padStart(2, '0');
        const arrivalMinutes = arrivalTime.getMinutes().toString().padStart(2, '0');
        
        document.getElementById("arrival").innerText = `${arrivalHours%12}:${arrivalMinutes}`;

        if (map.getSource(routeLayerId)) {
            map.removeLayer(routeLayerId);
            map.removeSource(routeLayerId);
        }

        map.addSource(routeLayerId, {
            type: "geojson",
            data: {
                type: "Feature",
                properties: {},
                geometry: route.geometry
            }
        });

        map.addLayer({
            id: routeLayerId,
            type: "line",
            source: routeLayerId,
            layout: {
                "line-join": "round",
                "line-cap": "round"
            },
            paint: {
                "line-color": "#abcbff",
                "line-width": 5,
                "line-opacity": 0.8
            }
        });
        const routeBounds = new mapboxgl.LngLatBounds();

        route.geometry.coordinates.forEach(coord => {
            routeBounds.extend(coord);
        });

        map.fitBounds(routeBounds, {
            padding: { top: 50, bottom: 50, left: 50, right: 50 },
            duration: 1000
        });

    } catch (error) {
        console.error("Error fetching route:", error);
    }
}

function toggleSidebar(id) {
    for (let i = 0;i<400;i+=20){
        setTimeout(() => map.resize(), i)
    }
    const sidebar = document.getElementById(id);
    sidebar.classList.toggle('collapsed');
    console.log(sidebar.querySelector(".sidebarContent").classList)
    sidebar.querySelector(".sidebarContent").classList.toggle("collapsed");
}

document.getElementById("startGrab").addEventListener("click", () => {
    document.getElementById("startInp").value = markedLoc.join(", ");
})

document.getElementById("destGrab").addEventListener("click", () => {
    document.getElementById("destInp").value = markedLoc.join(", ");
})

document.getElementById("calculateTravel").addEventListener("click", () => {
    const start = document.getElementById("startInp").value.split(", ");
    const dest = document.getElementById("destInp").value.split(", ");
    if (start.length == 2 && dest.length == 2 && transportMethod!="rideshare") {
        document.getElementById("rideInfo").style.display="none";
        document.getElementById("travelInfo").style.display="block";
        getRoute(start, dest, transportMethod);
    } else if (start.length==2&&dest.length==2){
        document.getElementById("travelInfo").style.display="none";
        document.getElementById("rideInfo").style.display="block";
        transportMethod = "driving";
        getRoute(start, dest, transportMethod).then(()=>{
            transportMethod = "rideshare"

            const time = document.getElementById("time").innerText;
            const dis = document.getElementById("distance").innerText;
    
            let rideData = [];
            rideData.push(...getUberFareEstimate(start, dest, dis, time));
            rideData.push(...getLyftFareEstimate(start, dest, dis, time));
    
            // <div class="rideInfo">
            //     <p class="title">UberX</p>
            //     <p class="price">$12</p>
            //     <p class="time">Arriving in 5 min</p>
            // </div>
            document.getElementById("rideInfoDiv").innerHTML = "";
            let lowestWaitTime = 999;
            for (let i of rideData){
                const rideInfo = document.createElement("div");
                rideInfo.classList.add("rideInfo");
                const title = document.createElement("p");
                title.classList.add("title");
                title.innerText = i.name;
                const price = document.createElement("p");
                price.classList.add("price");
                price.innerText = `$${i.price}`;
                const waitTime = document.createElement("p");
                waitTime.classList.add("time");
                waitTime.innerText = `Arriving in ${i.waitTime} min`;
                lowestWaitTime = Math.min(lowestWaitTime, i.waitTime);
                rideInfo.appendChild(title);
                rideInfo.appendChild(price);
                rideInfo.appendChild(waitTime);
                document.getElementById("rideInfoDiv").appendChild(rideInfo);
            }
            document.getElementById("timeShare").innerHTML = time;
            document.getElementById("distanceShare").innerHTML = dis;
            
            const arrivalTime = new Date(new Date().getTime() + time * 60000+lowestWaitTime*60000);
            const arrivalHours = arrivalTime.getHours().toString().padStart(2, '0');
            const arrivalMinutes = arrivalTime.getMinutes().toString().padStart(2, '0');
    
            document.getElementById("arrivalFast").innerText = `${arrivalHours%12}:${arrivalMinutes}`;
        })
        
    }
})


const uberApiUrl = 'https://api.uber.com/v1.2/estimates/price';
const uberApiKey = '...';
function getUberFareEstimate(start, dest, dis, time) {
    // commented out due to private api
    // const response = await fetch(uberApiUrl, {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         'Authorization': `Bearer ${uberApiKey}`
    //     },
    //     body: JSON.stringify({
    //         start_latitude: start[1],
    //         start_longitude: start[0],
    //         end_latitude: dest[1],
    //         end_longitude: dest[0]
    //     })
    // });

    // const data = await response.json();
    const data = [{
        "name": "UberX",
        "price": (3.278*dis).toFixed(2),
        "waitTime": Math.floor(Math.random()*5+2),
    },
    {
        "name": "UberXL",
        "price": (5.374*dis).toFixed(2),
        "waitTime": Math.floor(Math.random()*5+2),
    },
    {
        "name": "Comfort",
        "price": (4.402*dis).toFixed(2),
        "waitTime": Math.floor(Math.random()*5+2),
    }];
    return data;
}

function getLyftFareEstimate(start, dest, dis, time) {
    //lyyft api request removed due to private api
    const data = [{
        "name": "Lyft",
        "price": (1.77+2.65+0.81*dis+0.21*time).toFixed(2),
        "waitTime": Math.floor(Math.random()*5+2),
    },
    {
        "name": "Lyft XL",
        "price": (3.28+2.15+1.85*dis+0.35*time).toFixed(2),
        "waitTime": Math.floor(Math.random()*5+2),
    },
    {
        "name": "Extra Comfort",
        "price": (2.95+2.14+1.62*dis+0.32*time).toFixed(2),
        "waitTime": Math.floor(Math.random()*5+2),
    }];
    return data;
}

async function sendGPTMessage() {
    const input = document.getElementById("chatInput").value;
    if (!input) return;

    const responseBox = createMessage("Thinking...", false);
    const openaiApiKey = "...";
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openaiApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: [
                    { role: "system", content: `You are a transportation assistant for StealthCommute, a navigation tool. There are many options for travelling, walking, driving, and rideshare. Rideshare includes different levels of Uber and Lyft. All data must be passed as latitude and longtitude coordinates. The user's current longtitude and latitude are ${userLocation.join(', ')}. They have entered ${(document.getElementById("startInp").value.length>0)?(document.getElementById("startInp").value+" as their"): "no"} start location. They have entered ${(document.getElementById("destInp").value.length>0)?(document.getElementById("destInp").value+" as their"): "no"} destination. They have selected ${transportMethod} as their transport method. Suggest locations, rideshares, and city info. Answer concisely with just text.`},
                    { role: "user", content: input }
                ],
                functions: [
                    {
                        name: "set_route",
                        description: "Sets the route on the client side and calculates",
                        parameters: {
                            type: "object",
                            properties: {
                                start_location: { type: "array", description: "Start Location, An array of length 2, [longtitude, latitude].  Leave blank to not change" },
                                end_location: { type: "array", description: "Destination, An array of length 2, [longtitude, latitude].  Leave blank to not change" },
                                transport_method: {type: "string", description: "Method of transport, choose between walking, driving, cycling, or rideshare. Leave blank to not change"}
                            },
                            required: ["start_location", "end_location", "transport_method"]
                        }
                    }
                ]
            })
        });

        const data = await res.json();
        const message = data.choices[0].message;

        if (message.function_call) {
            const functionName = message.function_call.name;
            const functionArgs = JSON.parse(message.function_call.arguments);

            if (functionName === "set_route") {
                const res = await setRoute(
                    functionArgs.start_location,
                    functionArgs.end_location,
                    functionArgs.transport_method
                );
                if (res.success){
                    responseBox.innerText = `<strong>Set route infromation.</strong>`;
                    document.getElementById("chatInput").value = "";
                    document.getElementById("chatInput").disabled = false;
                } else {
                    responseBox.innerText = `<strong>Could not set route information.</strong>`;
                    document.getElementById("chatInput").disabled = false;
                }
            }
        } else {
            responseBox.innerText = message.content;
            document.getElementById("chatInput").value = "";
            document.getElementById("chatInput").disabled = false;
        }
    } catch (error) {
        responseBox.innerText = "Error fetching response.";
        document.getElementById("chatInput").disabled = false;
    }
}

function createMessage(text, isUser){
    const message = document.createElement("div");
    message.classList.add("message");
    if (isUser){
        message.classList.add("user");
    } else {
        message.classList.add("system");
    }
    message.innerText = text;
    document.getElementById("messages").appendChild(message);
    return message;
}

async function setRoute(start, end, transportMet) {
    console.log(start, end, transportMet);
    try {
        if (start) {
            document.getElementById("startInp").value = start.join(", ");
        }
        if (end) {
            document.getElementById("destInp").value = end.join(", ");
        }
        if (transportMet) {
            document.getElementById(transportMethod+'Sel').classList.remove('uk-active');
            transportMethod=transportMet;
            document.getElementById(transportMet+"Sel").classList.add('uk-active');
        }
        return { success: true };
    } catch (error) {
        return { success: false };
    }
}

document.getElementById("chatInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        document.getElementById("chatInput").disabled = true;
        createMessage(document.getElementById("chatInput").value, true);
        sendGPTMessage();
    }
});