const socket = io.connect('/');

let inputs;
let outputs;

let rpmGauge;
let rpmChart;
let rpmLine;
let rpmTargetLine;

$(document).ready(() => {
    //PAGE ELEMENTS
    rpmGauge = new JustGage({
        id: 'rpmGauge',
        value: 0,
        min: 0,
        max: 1200,
        label: 'RPM',
        labelFontColor: 'black',
        levelColorsGradient: true,
        levelColors: ['#00ff00', '#fffa00', '#ff0000'],
        gaugeColor: '#bebebe',
        relativeGaugeSize: true,
    });
    initRPMChart();
    
    //ENGINE INPUTS
    //GENERAL
    $('#ignitionBtn').click(() => {
        if(inputs.ignition) {
            inputs.ignition = false;
        } else {
            inputs.ignition = true;
        }
        socket.emit('SET', inputs);
    });
    $('#stroke2Btn').click(() => {
        inputs._2strokeMode = true;
        socket.emit('SET', inputs);
    });
    $('#stroke4Btn').click(() => {
        inputs._2strokeMode = false;
        socket.emit('SET', inputs);
    });

    //RAW
    $('#rawControlBtn').click(() => {
        inputs.raw = true;
        socket.emit('SET', inputs);
    });
    $('#firingDelayInput').on('input', () => {
        inputs.firingDelay = parseInt($('#firingDelayInput').val());
        socket.emit('SET', inputs);
    });
    $('#firingDurationInput').on('input', () => {
        inputs.firingDuration = parseInt($('#firingDurationInput').val());
        socket.emit('SET', inputs);
    });
    //PID
    $('#pidControlBtn').click(() => {
        inputs.raw = false;
        socket.emit('SET', inputs);
    });
    $('#rpmTargetInput').on('input', () => {
        inputs.targetRPM = parseInt($('#rpmTargetInput').val());
        socket.emit('SET', inputs);
    });

    $('#gayPony').dblclick(() => {ActivateGayPonyControlMode()});
});

function initRPMChart() {
    let rpmChartElement = document.getElementById("rpmChart");
    let rpmChartCtx = rpmChartElement.getContext('2d');

    if($(window).width() < 800) {
        rpmChartCtx.canvas.width = 150;
    } else {
        rpmChartCtx.canvas.width = 250;
    }

    rpmChart = new SmoothieChart({grid: {fillStyle: '#e2e2e2', sharpLines: true, verticalSections: 4}, labels: {fillStyle: '#000000', precision:0, fontSize: 16}, tooltip: true, minValue: 0, maxValue: 1000});
    rpmChart.streamTo(rpmChartElement, 100);

    rpmTargetLine = new TimeSeries();
    rpmChart.addTimeSeries(rpmTargetLine, {lineWidth: 3, strokeStyle: 'yellow', fillStyle: 'rgba(255,255,166,0.30)'});

    rpmLine = new TimeSeries();
    rpmChart.addTimeSeries(rpmLine, {lineWidth: 3, strokeStyle: 'blue'});
}

//SOCKET HANDLERS
socket.on('INPUTS', (data) => {
    inputs = data;
    updateInputs(inputs);
});

socket.on('OUTPUTS', (data) => {
    outputs = data;
    updateOutputs(outputs);
});

socket.on('LOG', (data) => {
    updateLog(data);
});

socket.on('disconnect', () => {
    $('#logDiv').append('<p>Connection lost.<p>');
    $('#logDiv').scrollTop($('#logDiv')[0].scrollHeight - $('#logDiv').height());
});


function updateInputs(inputs) {
    if(inputs._2strokeMode) {
        $('#stroke2Btn').addClass('pressed');
        $('#stroke4Btn').removeClass('pressed');
    } else {
        $('#stroke2Btn').removeClass('pressed');
        $('#stroke4Btn').addClass('pressed');
    }

    if(inputs.raw) {
        $('#rpmGauge').show();
        $('#rpmChart').hide();

        disableDiv('#rawControl', false);
        disableDiv('#pidControl', true);

        $('#rawControlBtn').addClass('pressed');
        $('#pidControlBtn').removeClass('pressed');
    } else {
        $('#rpmGauge').hide();
        $('#rpmChart').show();

        disableDiv('#rawControl', true);
        disableDiv('#pidControl', false);

        $('#rawControlBtn').removeClass('pressed');
        $('#pidControlBtn').addClass('pressed');
    }

    setBtnState('#ignitionBtn', inputs.ignition);

    $('#firingDelayText').text(inputs.firingDelay + ' ms');
    $('#firingDelayInput').val(inputs.firingDelay);

    $('#firingDurationText').text(inputs.firingDuration + ' ms');
    $('#firingDurationInput').val(inputs.firingDuration);

    $('#rpmTargetText').text(inputs.targetRPM + ' RPM');
    $('#rpmTargetInput').val(inputs.targetRPM);

    $('#KpText').text(inputs.Kp)
    $('#KiText').text(inputs.Ki)
    $('#KdText').text(inputs.Kd)
}

function updateOutputs(outputs) {
    if(inputs.raw) {
        rpmGauge.refresh(outputs.rpm);
    } else {
        rpmTargetLine.append(new Date().getTime(), inputs.targetRPM)
        rpmLine.append(new Date().getTime(), outputs.rpm)
    }
    
    $('#sensor1Text').text(outputs.sensor[0]);
    $('#sensor2Text').text(outputs.sensor[1]);

    $('#solenoid1Text').text(outputs.solenoid[0]);
    $('#solenoid2Text').text(outputs.solenoid[1]);

    $('#solenoid1StrokeNum').text(outputs.strokeNum[0]);
    $('#solenoid2StrokeNum').text(outputs.strokeNum[1]);
}

function disableDiv(id, state) {
    if(state) {
        $(id).children().css({'opacity' : 0.2})
        $(id).children().prop('disabled', true);
    } else {
        $(id).children().css({'opacity' : 1})
        $(id).children().prop('disabled', false);
    }
}

function setBtnState(id, state) {
    if(state) {
        $(id).val('ON')
        $(id).addClass('on');
    } else {
        $(id).val('OFF')
        $(id).removeClass('on');
    }
}

//HELPER FUNCTIONS
function zeroFill(number, width) {
    width -= number.toString().length;
    if (width > 0) {
        return new Array( width + (/\./.test( number ) ? 2 : 1) ).join( '0' ) + number;
    }
    return number + "";
}

function updateLog(log) {
    $('#logDiv').empty();

    for(let i = 0; i < log.length; i++) {
        $('#logDiv').append('<p><span>[' + log[i][0] + ']</span> ' + log[i][1] + '<p>');
    }

    $('#logDiv').scrollTop($('#logDiv')[0].scrollHeight - $('#logDiv').height());
}

