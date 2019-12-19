//-----------------------------------------------------------------------------
// copyright 2019 Doktor_Q all rights reserved.
// Released under the MIT license.
// http://opensource.org/licenses/mit-license.php
//=============================================================================

/*:
 * @plugindesc Allows you to create "motions" for events
 * @author Dr. Q
 *
 * @param Motions
 * @type struct<MotionData>[]
 * @desc List of standard motions available for events
 *
 * @param Compatability Mode
 * @type boolean
 * @desc Enable if another plugin changes the looping behavior
 * @on YES
 * @off NO
 * @default false
 *
 * @help
 * Creates a system of "motions" for use with on-map events and players, similar
 * to the one available in side-view battles. It was initially created for use
 * with SRPG_Core.js to animate the battlers, but can also be used to make
 * reusable animations for cutscenes, map events, or other battle systems.
 *
 * By default, the index points to the event's current file, from 0 to 7. If you 
 * need more than 8 motions, you can make use of the suffix- for example, if the
 * event normally uses hero.png, a motion with the suffix _dead would use
 * hero_dead.png. If you called the same animation on an event using villain.png,
 * it would instead use villain_dead.png.
 * 
 *
 * Script calls:
 *
 * event.playMotion('motion')  starts the event playing the specified motion
 * event.clearMotion()        stops any motions in progress
 * event.hasMotion()          returns True if the event is playing a motion
 * event.hasLoopingMotion()   returns True if the event is playing a motion that loops
 * event.hasSingleMotion()    returns True if the event is playing a motion that doesn't loop
 * event.waitForMotion()      in move routes, waits for the current (non-looping) motion
 * 
 * You can also make a new motion on the fly with playCustomMotion:
 * event.playCustomMotion({index: X, loop: true, wait: Y})
 * If omitted, loop defaults to "false", and wait defaults to 0. Index is required.
 */

/*~struct~MotionData:
 * @param Name
 * @desc The name used to call this motion
 * Capitalization doesn't matter
 * @type text
 *
 * @param Index
 * @desc The index on the character sheet for the motion
 * @type number
 * @min 0
 * @default 0
 *
 * @param Suffix
 * @desc Suffix to add to the character sheet filename
 * @type text
 *
 * @param Wait
 * @desc How long to wait between frames for this motion
 * Set to 0 to keep the setting from the user's speed
 * @type number
 * @min 0
 * @default 0
 *
 * @param Loop
 * @desc What the motion does when it finishes playing
 * Looping uses the same 0-1-2-1 pattern as normal walking
 * @type select
 * @option Play Once
 * @value 0
 * @option Hold Last Frame
 * @value 1
 * @option Loop
 * @value 2
 * @default 0
 */

(function(){

	var parameters = PluginManager.parameters('DRQ_EventMotions');
	// the motion list is fairly complex, actually
	Sprite_Character.MOTIONS = {};
	var _motionList = JSON.parse(parameters['Motions']);
	for (var i = 0; i < _motionList.length; i++) {
		var _motion = JSON.parse(_motionList[i]);
		if (!_motion.Name || _motion.Name.length == 0) continue;
		Sprite_Character.MOTIONS[_motion.Name.toUpperCase()] = {
			index: Number(_motion.Index || 0),
			wait: Number(_motion.Wait || 0),
			loop: Number(_motion.Loop) == 2,
			hold: Number(_motion.Loop) == 1,
			suffix: _motion.Suffix || ''
		};
	}
	var _compat = !!eval(parameters['Compatability Mode']) ? 0 : -1;

//====================================================================
// Add motions to events
//====================================================================

	// initialize the motion property
	_characterInitMembers = Game_Character.prototype.initMembers;
	Game_Character.prototype.initMembers = function() {
		_characterInitMembers.call(this);
		this._motion = null;
	};

	// check if there's a motion playing
	Game_Character.prototype.hasMotion = function() {
		return !!(this._motion);
	};

	// check if there's a looping motion playing
	Game_Character.prototype.hasLoopingMotion = function() {
		return !!(this._motion && (this._motion.loop || this._motion.hold));
	};

	// check if there's a non-looping motion playing
	Game_Character.prototype.hasSingleMotion = function() {
		return !!(this._motion && !this._motion.loop && !this._motion.hold);
	};

	// remove any active motion
	Game_Character.prototype.clearMotion = function() {
		this._motion = null;
		this._animationCount = 0;
		this.resetPattern();
	};

	// run a preset motion
	Game_Character.prototype.playMotion = function(motion, wait) {
		if (!motion) return;
		this.playCustomMotion(Sprite_Character.MOTIONS[motion.toUpperCase()], wait);
	};

	// run a motion created on the fly
	Game_Character.prototype.playCustomMotion = function(motionData, wait) {
		this._motion = motionData;
		if (this._motion) {
			motionData.loop ? this.resetPattern() : this._pattern = 0;
			this._animationCount = 0;

			if (wait && !motionData.loop) {
				this._waitCount = this.animationWait() * (this.maxPattern() + _compat);
			}
		}
	};

	// wait for the current motion to finish (non-looping only)
	Game_Character.prototype.waitForMotion = function() {
		if (!this._motion || this._motion.loop) return;
		var frameWait = this.animationWait();
		var frameCount = this.maxPattern() - this._pattern + _compat;
		var partialFrame = this._animationCount;
		// technically, it just computes the remaining motion duration
		this._waitCount = frameWait * frameCount - partialFrame;
	};

//====================================================================
// Use the active motion instead of normal properties
//====================================================================

	// when a motion is active, you always animate
	var _hasStepAnime = Game_Character.prototype.hasStepAnime;
	Game_Character.prototype.hasStepAnime = function() {
		if (this._motion) {
			return true;
		} else {
			return _hasStepAnime.call(this);
		}
	};

	// override the character index for motions
	var _characterIndex = Game_Character.prototype.characterIndex;
	Game_Character.prototype.characterIndex = function() {
		if (this._motion) {
			return this._motion.index;
		} else {
			return _characterIndex.call(this);
		}
	};

	// override the character file for motions (rarely used)
	var _characterName = Game_Character.prototype.characterName;
	Game_Character.prototype.characterName = function() {
		if (this._motion && this._motion.suffix) {
			return _characterName.call(this)+this._motion.suffix;
		} else {
			return _characterName.call(this);
		}
	};

	// override normal animation wait for motions
	var _animationWait = Game_Character.prototype.animationWait;
	Game_Character.prototype.animationWait = function() {
		if (this._motion && this._motion.wait > 0) {
			return this._motion.wait;
		} else {
			return _animationWait.call(this);
		}
	};

	// update the motion, and reset at the end of a non-looping, non-held motion
	var _updatePattern = Game_Character.prototype.updatePattern;
	Game_Character.prototype.updatePattern = function() {
		if (this._motion) {
			if (this._motion.loop) {
				this._pattern = (this._pattern + 1) % this.maxPattern();
			} else if (this._pattern < this.maxPattern() + _compat - 1) {
				this._pattern++;
			} else if (this._motion.hold) {
				this._motion._done = true;
			} else {
				this.clearMotion();
			}
		} else {
			_updatePattern.call(this);
		}
	};

})();