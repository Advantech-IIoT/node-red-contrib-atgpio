/**
 * Copyright 2017 Advantech Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
// require any external libraries we may need....
const gpio = require('node-atgpio');

module.exports = (RED) => {
    const gpioCount = gpio.count();

    const pinsInUse = {};
    const pinTypes = {
        out: RED._('at-gpio.types.output'),
        in: RED._('at-gpio.types.input')
    };

    function calcRate(node) {
        let rate = 1000;
        switch (node.rateUnit) {
        case 'ms':
            rate = node.rate; // milliseconds
            break;
        case 's':
            rate = node.rate * 1000; // seconds
            break;
        case 'm':
            rate = node.rate * 60000; // minutes
            break;
        case 'h':
            rate = node.rate * 3600000; // hours
            break;
        default:
            break;
        }
        return rate;
    }

    function GetGPIOInfo() {
        const info = {
            count: gpioCount,
            gpios: []
        };
        if (gpioCount > 0) {
            for (let i = 0; i < gpioCount; i += 1) {
                const io = {};
                io.pin = i;
                io.mode = gpio.getmode(i) ? 'Input' : 'Output';
                io.value = gpio.read(i);
                info.gpios.push(io);
            }
        }
        return info;
    }
    // The main node definition - most things happen in here

    function GPIOInfoNode(n) {
        // Create a RED node
        RED.nodes.createNode(this, n);
        this.rate = n.rate;
        this.rateUnit = n.rateUnit;

        // copy "this" object in case we need it in context of callbacks of other functions.
        const node = this;
        let timerID = null;
        node.status({
            fill: 'blue',
            shape: 'dot',
            text: 'Initiating.....'
        });
        node.status({
            fill: 'blue',
            shape: 'dot',
            text: 'Polling.....'
        });
        node.send({
            payload: GetGPIOInfo()
        });
        node.status({
            fill: 'green',
            shape: 'dot',
            text: 'common.status.ok'
        });

        if (timerID != null) {
            clearInterval(timerID);
            timerID = null;
        }
        if (!timerID) {
            timerID = setInterval(() => {
                node.status({
                    fill: 'blue',
                    shape: 'dot',
                    text: 'Polling.....'
                });
                node.send({
                    payload: GetGPIOInfo()
                });
                node.status({
                    fill: 'green',
                    shape: 'dot',
                    text: 'common.status.ok'
                });
            }, calcRate(node));
        }

        node.on('input', () => {
            node.status({
                fill: 'blue',
                shape: 'dot',
                text: 'Polling.....'
            });
            node.send({
                payload: GetGPIOInfo()
            });
            node.status({
                fill: 'green',
                shape: 'dot',
                text: 'common.status.ok'
            });
        });

        node.on('close', () => {
            node.status({
                fill: 'grey',
                shape: 'ring',
                text: 'at-gpio.status.closed'
            });
            if (timerID) {
                clearInterval(timerID);
            }
            timerID = null;
        });
    }

    RED.nodes.registerType('atgpio info', GPIOInfoNode);

    function GPIOInNode(n) {
        // Create a RED node
        RED.nodes.createNode(this, n);

        // Store local copies of the node configuration (as defined in the .html)
        this.pin = Number(n.pin || -1);
        this.dir = n.dir;
        this.rate = n.rate;
        this.rateUnit = n.rateUnit;

        // copy "this" object in case we need it in context of callbacks of other functions.
        const node = this;
        let timerID = null;

        node.status({
            fill: 'blue',
            shape: 'dot',
            text: 'Initiating.....'
        });

        node.on('close', () => {
            node.status({
                fill: 'grey',
                shape: 'ring',
                text: 'at-gpio.status.closed'
            });
            delete pinsInUse[node.pin];
            if (timerID) {
                clearInterval(timerID);
            }
            timerID = null;
        });

        if (node.pin !== undefined && node.pin >= 0) {
            // eslint no-prototype-builtins
            if (!Object.prototype.hasOwnProperty.call(pinsInUse, node.pin)) {
                pinsInUse[this.pin] = this.dir;
            } else if ((pinsInUse[this.pin] !== this.dir)) {
                const msg = RED._('at-gpio.errors.alreadyset', {
                    pin: this.pin,
                    type: pinTypes[pinsInUse[this.pin]]
                });
                node.warn(msg);
                node.status({
                    fill: 'red',
                    shape: 'dot',
                    text: msg
                });
                return;
            }

            if (gpio.getmode(this.pin) !== gpio.INPUT) {
                try {
                    gpio.setup(node.pin, gpio.INPUT);
                } catch (e) {
                    node.error('GPIOInNode: Please cheack your pin direction!');
                    node.status({
                        fill: 'red',
                        shape: 'dot',
                        text: 'Please cheack your pin direction!'
                    });
                    return;
                }
            }

            node.status({
                fill: 'green',
                shape: 'dot',
                text: 'common.status.ok'
            });
            if (timerID != null) {
                clearInterval(timerID);
                timerID = null;
            }
            if (!timerID) {
                timerID = setInterval(() => {
                    const val = gpio.read(node.pin);
                    node.send({
                        topic: `at-gpio/${node.pin}`,
                        payload: Number(val)
                    });
                }, calcRate(node));
            }
        } else {
            node.warn(`${RED._('at-gpio.errors.invalidpin')}: ${node.pin}`);
            node.status({
                fill: 'red',
                shape: 'dot',
                text: `${RED._('at-gpio.errors.invalidpin')}: ${node.pin}`
            });
            return;
        }
    }

    // Register the node by name. This must be called before overriding any of the
    // Node functions.
    RED.nodes.registerType('atgpio in', GPIOInNode);

    function GPIOOutNode(n) {
        // Create a RED node
        RED.nodes.createNode(this, n);

        // Store local copies of the node configuration (as defined in the .html)
        this.pin = Number(n.pin || -1);
        this.dir = n.dir;
        this.set = n.set || false;
        this.level = Number(n.level || 0);
        // copy "this" object in case we need it in context of callbacks of other functions.
        const node = this;

        function inputlistener(msg) {
            // eslint no-prototype-builtins
            if (!(msg && Object.prototype.hasOwnProperty.call(msg, 'payload')))
                return;

            if (msg.payload == null) {
                node.status({
                    fill: 'red',
                    shape: 'dot',
                    text: 'payload error'
                });
                node.error('GPIOOutNode: Invalid msg.payload!');
                return;
            }

            if (node.pin === undefined || node.pin < 0) {
                return;
            }

            if (msg.payload === 'true') {
                msg.payload = true;
            }
            if (msg.payload === 'false') {
                msg.payload = false;
            }
            const out = Number(msg.payload);

            if ((out !== gpio.LOW) && (out !== gpio.HIGH)) {
                node.warn(`${RED._('at-gpio.errors.invalidinput')}: ${out}`);
                node.status({
                    fill: 'red',
                    shape: 'dot',
                    text: `${RED._('at-gpio.errors.invalidinput')}: ${out}`
                });
                return;
            }
            if (RED.settings.verbose) {
                node.log(`out: ${msg.payload}`);
            }
            gpio.write(node.pin, out);
            node.status({
                fill: 'green',
                shape: 'dot',
                text: out
            });
        }

        node.status({
            fill: 'blue',
            shape: 'dot',
            text: 'Initiating.....'
        });

        node.on('close', () => {
            node.status({
                fill: 'grey',
                shape: 'ring',
                text: 'at-gpio.status.closed'
            });
            if (node.pin !== undefined && node.pin >= 0) {
                delete pinsInUse[node.pin];
            }
        });

        if (node.pin !== undefined && node.pin >= 0) {
            if (!Object.prototype.hasOwnProperty.call(pinsInUse, node.pin)) {
                pinsInUse[this.pin] = this.dir;
            } else if ((pinsInUse[this.pin] !== this.dir)) {
                const msg = RED._('at-gpio.errors.alreadyset', {
                    pin: this.pin,
                    type: pinTypes[pinsInUse[this.pin]]
                });
                node.warn(msg);
                node.status({
                    fill: 'red',
                    shape: 'dot',
                    text: msg
                });
                return;
            }

            if (node.set) {
                if (gpio.getmode(this.pin) !== gpio.OUTPUT) {
                    try {
                        gpio.setup(node.pin, gpio.OUTPUT);
                    } catch (e) {
                        node.error('GPIOOutNode: Please cheack your pin direction!');
                        node.status({
                            fill: 'red',
                            shape: 'dot',
                            text: 'Please cheack your pin direction!'
                        });
                        return;
                    }
                }
                gpio.write(node.pin, node.level);
                node.status({
                    fill: 'green',
                    shape: 'dot',
                    text: String(node.level)
                });
            } else {
                if (gpio.getmode(this.pin) !== gpio.OUTPUT) {
                    try {
                        gpio.setup(node.pin, gpio.OUTPUT);
                    } catch (e) {
                        node.error('GPIOOutNode: Please cheack your pin direction!');
                        node.status({
                            fill: 'red',
                            shape: 'dot',
                            text: 'Please cheack your pin direction!'
                        });
                        return;
                    }
                }
                node.status({
                    fill: 'green',
                    shape: 'dot',
                    text: 'common.status.ok'
                });
            }
            node.on('input', inputlistener);
        } else {
            node.warn(`${RED._('at-gpio.errors.invalidpin')}: ${node.pin}`);
            node.status({
                fill: 'red',
                shape: 'dot',
                text: `${RED._('at-gpio.errors.invalidpin')}: ${node.pin}`
            });
            return;
        }
    }

    RED.nodes.registerType('atgpio out', GPIOOutNode);

    RED.httpAdmin.get('/at-gpio/count/:id', RED.auth.needsPermission('at-gpio.read'), (req, res) => {
        res.json(gpioCount);
    });
    RED.httpAdmin.get('/at-gpio/pins/:id', RED.auth.needsPermission('at-gpio.read'), (req, res) => {
        res.json(pinsInUse);
    });
};
