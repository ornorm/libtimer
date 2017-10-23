/** @babel */
import {Observable,Observer} from 'libobs/lib/obs';

export const getTime = () => {
    return Date.now();
};

export class TimerTask {

    constructor({run=null}={}) {
        this.when = 0;
        this.period = 0;
        this.fixedRate = false;
        this.cancelled = false;
        this.scheduledTime = 0;
        if (run) {
            this.run = run;
        }
    }

    cancel() {
        let willRun = !this.cancelled && this.when > 0;
        this.cancelled = true;
        return willRun;
    }

    getWhen() {
        return this.when;
    }

    isScheduled() {
        return this.when > 0 || this.scheduledTime > 0;
    }

    run() {

    }

    scheduledExecutionTime() {
        return this.scheduledTime;
    }

    setScheduledTime(time) {
        this.scheduledTime = time;
    }
}

const DEFAULT_HEAP_SIZE = 256;

export class TimerHeap extends Observable {

    constructor(heapSize=DEFAULT_HEAP_SIZE) {
        super();
        this.deletedCancelledNumber = this.size = 0;
        this.heapSize = heapSize;
        this.timers = new Array(this.heapSize);
    }

    adjustMinimum() {
        this.downHeap(0);
    }

    deleteIfCancelled() {
        for (let i = 0; i < this.size; i++) {
            let timer = this.timers[i];
            if (timer.cancelled) {
                this.deletedCancelledNumber++;
                this.remove(i);
                i--;
            }
        }
    }

    downHeap(pos=0) {
        let current = pos;
        let child = 2 * current + 1;
        while (child < this.size && this.size > 0) {
            if (child + 1 < this.size && this.timers[child + 1].when < this.timers[child].when) {
                child++;
            }
            if (this.timers[current].when < this.timers[child].when) {
                break;
            }
            let tmp = this.timers[current];
            this.timers[current] = this.timers[child];
            this.timers[child] = tmp;
            current = child;
            child = 2 * current + 1;
        }
    }

    getTask(task) {
        for (let i = 0; i < this.timers.length; i++) {
            let timer = this.timers[i];
            if (timer === task) {
                return i;
            }
        }
        return -1;
    }

    insert(task) {
        this.timers[this.size++] = task;
        this.upHeap();
        this.setChanged();
        this.notifyObservers(this.size);
    }

    isEmpty() {
        return this.size === 0;
    }

    minimum() {
        return this.timers[0];
    }

    remove(pos) {
        if (pos >= 0 && pos < this.size) {
            this.timers[pos] = this.timers[--this.size];
            this.timers[this.size] = null;
            this.downHeap(pos);
            this.setChanged();
            this.notifyObservers(pos);
        }
    }

    reset() {
        this.timers = new Array(this.heapSize);
        this.size = 0;
    }

    upHeap() {
        let current = this.size - 1;
        let parent = (current - 1) / 2;
        if (current >= 0 && parent >=0) {
            while (this.timers[current].when < this.timers[parent].when) {
                let tmp = this.timers[current];
                this.timers[current] = this.timers[parent];
                this.timers[parent] = tmp;
                current = parent;
                parent = (current - 1) / 2;
            }
        }
    }
}

export class Timer extends Observer {

    constructor(heapSize=DEFAULT_HEAP_SIZE) {
        super();
        this.cancelled = this.finished = false;
        this.tasks = new TimerHeap(heapSize);
        this.tasks.addObserver(this);
    }

    cancel() {
        this.cancelled = true;
        this.tasks.reset();
    }

    insertTask(newTask) {
        this.tasks.insert(newTask);
    }

    purge() {
        if (this.tasks.isEmpty()) {
            return 0;
        }
        this.tasks.deletedCancelledNumber = 0;
        this.tasks.deleteIfCancelled();
        return this.tasks.deletedCancelledNumber;
    }

    run() {
        if (this.cancelled) {
            return;
        }
        if (this.tasks.isEmpty()) {
            if (this.finished) {
                return;
            }
        } else {
            let currentTime = getTime();
            let task = this.tasks.minimum();
            if (task.cancelled) {
                this.tasks.remove(0);
                return;
            }
            let timeToSleep = task.when - currentTime;
            if (timeToSleep > 0) {
                this.wait(timeToSleep);
            } else {
                let pos = 0;
                if (this.tasks.minimum().when !== task.when) {
                    pos = this.tasks.getTask(task);
                }
                if (task.cancelled) {
                    this.tasks.remove(this.tasks.getTask(task));
                    return;
                }
                task.setScheduledTime(task.when);
                this.tasks.remove(pos);
                if (task.period >= 0) {
                    if (task.fixedRate) {
                        task.when = task.when + task.period;
                    } else {
                        task.when = getTime() + task.period;
                    }
                    this.insertTask(task);
                } else {
                    task.when = 0;
                }
                let taskCompletedNormally = false;
                try {
                    task.run();
                    taskCompletedNormally = true;
                } catch(e) {
                    console.error(e);
                } finally {
                    if (!taskCompletedNormally) {
                        this.cancelled = true;
                    }
                }
            }
        }
    }

    schedule({task,when=null,period=-1,delay=-1}={}) {
        if (!task) {
            throw new ReferenceError("NullPointerException task is null")
        }
        if (when && period) {
            if (when.getTime() < 0 || period <= 0) {
                throw new RangeError("IllegalArgumentException when < 0: " + when + " || period < 0 " + period);
            }
            let delay = when.getTime() - getTime();
            this.scheduleImpl({ task, delay : delay < 0 ? 0 : delay, period, fixed : false });
        } else if (when) {
            if (when.getTime() < 0) {
                throw new RangeError("IllegalArgumentException when < 0: " + when.getTime());
            }
            let delay = when.getTime() - getTime();
            this.scheduleImpl({ task, delay : delay < 0 ? 0 : delay, period : -1, fixed : false });
        } else if (delay && period) {
            if (delay < 0 || period <= 0) {
                throw new RangeError("IllegalArgumentException delay < 0: " + delay + " || period < 0 " + period);
            }
            this.scheduleImpl({ task, delay, period, fixed : false });
        } else if (delay) {
            if (delay < 0) {
                throw new RangeError("IllegalArgumentException delay < 0: " + delay);
            }
            this.scheduleImpl({ task, delay, period : -1, fixed : false });
        }
    }

    scheduleAtFixedRate({task,when=null,period=-1,delay=-1}={}) {
        if (!task) {
            throw new ReferenceError("NullPointerException task is null")
        }
        if (when && period) {
            if (when.getTime() < 0 || period <= 0) {
                throw new RangeError("IllegalArgumentException when < 0: " + when + " || period < 0 " + period);
            }
            let delay = when.getTime() - getTime();
            this.scheduleImpl({ task, delay : delay < 0 ? 0 : delay, period, fixed : true });
        } else if (delay && period) {
            if (delay < 0 || period <= 0) {
                throw new RangeError("IllegalArgumentException delay < 0: " + delay + " || period < 0 " + period);
            }
            this.scheduleImpl({ task, delay, period, fixed : true });
        }
    }

    scheduleImpl({task,period=-1,delay=-1,fixed=false}={}) {
        if (this.cancelled) {
            throw new Error("IllegalStateException Timer was canceled");
        }
        let when = delay + getTime();
        if (when < 0) {
            throw new RangeError("IllegalArgumentException Illegal delay to start the TimerTask: " + when);
        }
        if (task.isScheduled()) {
            throw new Error("IllegalStateException TimerTask is scheduled already");
        }
        if (task.cancelled) {
            throw new Error("IllegalStateException TimerTask is canceled");
        }
        task.when = when;
        task.period = period;
        task.fixedRate = fixed;
        this.insertTask(task);
    }

    update(timerHeap, pos) {
        this.run();
    }

    wait(time) {
        let tid = setTimeout(() => {
            clearTimeout(tid);
            tid = -1;
            this.run();
        }, time);
    }
}