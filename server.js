const express = require('express');
const socket = require('socket.io');
const Gpio = require('onoff').Gpio;
const PidController = require('node-pid-controller');

// APP SETUP
const serverPort = 8080;
const app = express();
const server = app.listen(serverPort, () => {
	logText("Server started on port: " + serverPort)
});
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(express.static('public'));
const io = socket(server);

let socketsConnected = 0;

let serverLog = [];

// SENSORS
let sensor = [];
sensor[0] = new Gpio(22, 'in', 'both');
sensor[1] = new Gpio(27, 'in', 'both');

// SOLENOIDS
let solenoid = []
solenoid[0] = new Gpio(17, 'out');
solenoid[1] = new Gpio(18, 'out');

// RPM CALCULATION
let lastReadings = [];

process.on('SIGINT', () => {
    console.log('Shutting down the server...')
    sensor[0].unexport();
    sensor[1].unexport();
    solenoid[0].unexport();
    solenoid[1].unexport();
    process.exit(0);
});

const inputDefaults = {
    targetRPM: 150,

    firingDelay: 10,
    firingDuration: 10,
}

let inputs = {
    ignition: true,
    _2strokeMode: true,
    raw: true,

    targetRPM: inputDefaults.targetRPM,

    firingDelay: inputDefaults.firingDelay,
    firingDuration: inputDefaults.firingDuration,
    firingDurationMin: 1,
    firingDurationMax: 100,

    Kp: 0.25,
    Ki: 0.01,
    Kd: 0.01,
}

let outputs = {
    sensor: [0, 0],
    solenoid: [0, 0],
    strokeNum: [1, 2],
    rpm: 0,
}

// RPM PID CONTROLLER
function resetRpmController() {
    return new PidController({
        k_p: inputs.Kp,
        k_i: inputs.Ki,
        k_d: inputs.Kd,
    });
}
let RpmController = resetRpmController();

// OPTIONAL INCASE HARDWARE GIVES UNRELIABLE READINGS
let stateCooldown = false;
let stateCooldownDuration = 150;

// 4 STROKE HELPER VARIABLE
let _4strokeFireNow = true;

// ENGINE CONTROLS
sensor[0].watch((err, value) => {
    sensorStateChanged(0, err, value);
});
sensor[1].watch((err, value) => {
    sensorStateChanged(1, err, value);
});

function sensorStateChanged(id, err, value) {
    if (err) { throw err }; 
    outputs.sensor[id] = value;
    
    if(value && !stateCooldown) {
        stateCooldown = true;
        setTimeout(() => {stateCooldown = false;}, stateCooldownDuration);

        lastReadings.push(Date.now());

        if(!inputs.ignition) {return;}

        outputs.strokeNum[0]++;
        outputs.strokeNum[1]++;

        if(inputs._2strokeMode) {
            if(outputs.strokeNum[0] > 2) outputs.strokeNum[0] = 1;
            if(outputs.strokeNum[1] > 2) outputs.strokeNum[1] = 1;
        } else {
            
            if(outputs.strokeNum[0] > 4) outputs.strokeNum[0] = 1;
            if(outputs.strokeNum[1] > 4) outputs.strokeNum[1] = 1;

            // 4 STROKE MODE FIRES EVERY OTHER CYCLE
            if(!_4strokeFireNow) {
                _4strokeFireNow = true;
                return;
            }
            _4strokeFireNow = false
        }

        setTimeout(() => {
            changeSolenoidState(id, 1)
            
            setTimeout(() => {
                changeSolenoidState(id, 0)
            }, inputs.firingDuration);
        }, inputs.firingDelay)
    }
}

function changeSolenoidState(id, value) {
    solenoid[id].writeSync(value)
    outputs.solenoid[id] = value;
}

// ECU MAIN LOOP
setInterval(() => {
    //CALCULATE RPM
    for(let i = lastReadings.length; i >= 0; i--) {
        if(lastReadings[i] < Date.now() - 1100) {
            lastReadings.splice(i, 1);
        }
    }
    outputs.rpm = ((lastReadings.length / 2)/1.1) * 60

    // PID CONTROLLER
    if(!inputs.raw) {
        RpmController.setTarget(inputs.targetRPM);
        inputs.firingDuration = Math.round(RpmController.update(outputs.rpm));

        if(inputs.firingDuration > inputs.firingDurationMax) {
            inputs.firingDuration = inputs.firingDurationMax;
        } else if(inputs.firingDuration < inputs.firingDurationMin) {
            inputs.firingDuration = inputs.firingDurationMin;
        }

        io.sockets.emit('INPUTS', inputs);
    }

    io.sockets.emit('OUTPUTS', outputs);
}, 100);

io.on('connection', (socket) => {
    socketsConnected++;
    logText('Socket ' + socket.id.substring(0, 10) + " connected. Connections: " + socketsConnected);

    // SENDS UPDATE PACKET TO NEW CLIENT
    socket.emit('INPUTS', inputs);

    socket.on('SET', (data) => {
        
        if(data.raw !== inputs.raw) {
            // IF CONTROL MODE CHANGED, RESET INPUTS AND PID CONTROLLER
            inputs.firingDelay = inputDefaults.firingDelay;
            inputs.firingDuration = inputDefaults.firingDelay;
            inputs.targetRPM = inputDefaults.targetRPM;

            RpmController = resetRpmController();

            inputs.raw = data.raw;
        } else {
            // IF STROKE MODE CHANGED DOES RESET
            if(data._2strokeMode !== inputs._2strokeMode) {
                if(data._2strokeMode) {
                    outputs.strokeNum = [1, 2]
                } else {
                    outputs.strokeNum = [1, 3]
                }
                
                _4strokeFireNow = true;
            }

            inputs = data;
        }

        io.sockets.emit('INPUTS', inputs);
    });

    socket.on('disconnect', () => {
        socketsConnected--;
        logText('Socket ' + socket.id.substring(0, 10) + " disconnected. Connections: " + socketsConnected);
    });
});

// LOGS TEXT TO SERVER CONSOLE AND CLIENT
function logText(text) {
    let currentDate = new Date();
    let timestamp = currentDate.getHours().toString().padStart(2, '0') + ':' + currentDate.getMinutes().toString().padStart(2, '0') + ':' + currentDate.getSeconds().toString().padStart(2, '0');

    serverLog.push([timestamp , text])

    io.sockets.emit('LOG', serverLog);
    console.log(text);
}

