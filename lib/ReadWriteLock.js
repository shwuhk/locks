function ReadWriteLock() {
	this._isLocked = false;
	this._readLocks = 0;
	this._waitingToRead = [];
	this._waitingToWrite = [];
}

module.exports = ReadWriteLock;


ReadWriteLock.prototype.readLock = function () {
	return new Promise((resolve, reject) => {
		if (this._isLocked === 'W') {
			this._waitingToRead.push(resolve);
		} else {
			this._readLocks += 1;
			this._isLocked = 'R';
			resolve()
		}
	})
};


ReadWriteLock.prototype.writeLock = function () {
	return new Promise((resolve, reject) => {
		if (this._isLocked) {
			this._waitingToWrite.push(resolve);
		} else {
			this._isLocked = 'W';
			resolve()
		}
	})
};


ReadWriteLock.prototype.timedReadLock = function (ttl) {
	return new Promise((resolve, reject) => {
		if (this.tryReadLock()) {
			resolve()
			return
		}

		var timer, that = this;

		function waiter() {
			clearTimeout(timer);
			resolve()
		}

		this._waitingToRead.push(waiter);

		timer = setTimeout(function () {
			var index = that._waitingToRead.indexOf(waiter);
			if (index !== -1) {
				that._waitingToRead.splice(index, 1);
				reject(new Error('ReadLock timed out'))
			}
		}, ttl);
	})
};


ReadWriteLock.prototype.timedWriteLock = function (ttl, cb) {
	return new Promise((resolve, reject) => {
		if (this.tryWriteLock()) {
			resolve()
			return
		}

		var timer, that = this;

		function waiter() {
			clearTimeout(timer);
			resolve()
		}

		this._waitingToWrite.push(waiter);

		timer = setTimeout(function () {
			var index = that._waitingToWrite.indexOf(waiter);
			if (index !== -1) {
				that._waitingToWrite.splice(index, 1);
				reject(new Error('ReadLock timed out'))
			}
		}, ttl);
	})
};

Object.defineProperty(ReadWriteLock.prototype, 'isReadLocked', {
	get: function () {
		return this._isLocked === 'R';
	}
});

Object.defineProperty(ReadWriteLock.prototype, 'isWriteLocked', {
	get: function () {
		return this._isLocked === 'W';
	}
});

ReadWriteLock.prototype.tryReadLock = function () {
	if (this._isLocked === 'W') {
		return false;
	}

	this._isLocked = 'R';
	this._readLocks += 1;
	return true;
};


ReadWriteLock.prototype.tryWriteLock = function () {
	if (this._isLocked) {
		return false;
	}

	this._isLocked = 'W';
	return true;
};


ReadWriteLock.prototype.unlock = function () {
	var waiter;

	if (this._isLocked === 'R') {
		this._readLocks -= 1;

		if (this._readLocks === 0) {
			// allow one write lock through

			waiter = this._waitingToWrite.shift();
			if (waiter) {
				this._isLocked = 'W';
				waiter.call(this);
			} else {
				this._isLocked = false;
			}
		}
	} else if (this._isLocked === 'W') {
		// allow all read locks or one write lock through

		var rlen = this._waitingToRead.length;

		if (rlen === 0) {
			waiter = this._waitingToWrite.shift();
			if (waiter) {
				this._isLocked = 'W';
				waiter.call(this);
			} else {
				this._isLocked = false;
			}
		} else {
			this._isLocked = 'R';
			this._readLocks = rlen;

			var waiters = this._waitingToRead.slice();
			this._waitingToRead = [];

			for (var i = 0; i < rlen; i++) {
				waiters[i].call(this);
			}
		}
	} else {
		throw new Error('ReadWriteLock is not locked');
	}
};
