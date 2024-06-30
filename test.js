//java の enum みたいな感じが出来るかと試し。
//これだけでは偽造防止にはならないわね。
class Player {
	static #_WHITE;
	static #_BLACK;

	static #create() {
		Player.#isInternalConstracting = true;
		const w = new Player(0);
		const b = new Player(1);
		Player.#isInternalConstracting = false;
		//座標補正, 左上を原点とする座標内で白は下から
		w.coordinateCorrection = (x, y, dx, dy) => ({xx:x+dx, yy:y+dy});
		w.next = b;
		//黒は上から
		b.coordinateCorrection = (x, y, dx, dy) => ({xx:x-dx, yy:y-dy});
		b.next = w;

		Player.#_WHITE = Object.freeze(w);
		Player.#_BLACK = Object.freeze(b);
	}

	static get WHITE() {
		if(!Player.#_WHITE) Player.#create();
		return Player.#_WHITE;
	}
	static get BLACK() {
		if(!Player.#_BLACK) Player.#create();
		return Player.#_BLACK;
	}
	static get values() {
		if(!Player.#_WHITE) Player.#create();
		return [Player.#_WHITE, Player.#_BLACK];
	}

	static #isInternalConstracting = false;

	constructor(num) {
		if(!Player.#isInternalConstracting) throw new TypeError('invalid constract');
		this.num = num;
	}
}

class Piece {
	constructor(x, y, player, imageNum) {
		this.x = x;
		this.y = y;
		this.player = player;
		this.imageNum = imageNum;
	}
	moveTo(x, y) {
		this.x = x;
		this.y = y;
	}
	//各方向への直線移動(獲得)プラン
	getStraightPlans(deltas, gameBoard) {
		const result = [];
		deltas.forEach(({dx, dy}) => {
			const route = [];
			for(let xx=this.x, yy=this.y; ; route.push({x:xx, y:yy})) {
				({xx, yy} = this.player.coordinateCorrection(xx, yy, dx, dy));
				const {inside, value} = gameBoard.get(xx, yy);
				if(!inside) break; //枠の外なら終わり
				const plan = new ActionPlan(xx, yy, this, value, route); //移動・獲得・ガード
				result.push(plan);
				if(value) {
					// King をチェックした場合に同じ直線上に移動出来ないようにするため、1つ先の情報も付け足しておく
					const extraStep = this.player.coordinateCorrection(xx, yy, dx, dy);
					this.#appendExtraStepTo(plan, extraStep, gameBoard);
					break;
				}
			}
		});
		return result;
	}
	#appendExtraStepTo(plan, extraStep, gameBoard) {
		const {inside, value} = gameBoard.get(extraStep.xx, extraStep.yy);
		if(inside && !value) plan.extraStep = {x:extraStep.xx, y:extraStep.yy};
	}
}

class Board {
	constructor(w, h) {
		this.w = w;
		this.h = h;
		this._board = []
	}
	isInside(x, y) {
		return 0 <= x && x < this.w && 0 <= y && y < this.h;
	}
	get(x, y) {
		if(!this.isInside(x, y)) return {inside:false};
		return {inside:true, value:this._board.find(v => v.x === x && v.y === y)};
	}
	put(value) {
		if(!this.isInside(value.x, value.y)) return;
		let i = this._board.findIndex(v => v.x === value.x && v.y === value.y);
		if(i >= 0) this._board.splice(i, 1);
		this._board.push(value);
	}
	clear() {
		this._board.splice(0);
	}
	toString() {
		let s = [...Array(this.h)].map(_ => [...Array(this.w)].fill("x"));
		this._board.forEach(v => s[v.y][v.x]="@");
		return s.map(r => r.join(",")).join("\n");
	}
}

//ゲーム盤. 各座標には Piece オブジェクトが 1 つだけ
class GameBoard extends Board {
	constructor(w, h) {
		super(BOARD_SIZE, BOARD_SIZE);
	}
	getPieces(player) {
		return this._board.filter(v => v.player === player);
	}
	getKing(player) {
		return this._board.find(v => v instanceof King);
	}
}

//piece 毎の行動プランの情報(マス毎)
class ActionPlan {
	constructor(x, y, piece, target, route) {
		this.x = x; //対象位置
		this.y = y;
		this.piece = piece; //アクションするピース
		this.target = target; //対象ピース(自分の駒だったらガード対象, 相手の駒だったら取られる駒)
		this.route = route && route.lenth > 0 ? structuredClone(route) : undefined; //ここに来るまでに piece が通る位置{x,y}
		this.captureOnly = false; //true だったら target が空でも(単なる)移動先には出来ない (Pawn の斜め前用)
	}
	setCaptureOnly(captureOnly) {
		this.captureOnly = !!captureOnly;
		return this;
	}
	isCapture() {
		return this.target && this.target.player !== this.piece.player;
	}
	isGuard() {
		return this.target && this.target.player === this.piece.player;
	}
	isMovable() {
		return this.target ? this.target.player !== this.piece.player : !this.captureOnly;
	}
}

//player 毎の次行動プラン
// 各座標には複数の Piece の ActionPlan が入る(配列)
class PlanBoard extends Board {
	constructor(gameBoard, player, opponentPlanBoard) {
		super(gameBoard.w, gameBoard.h);

		//player の各駒の行動を各マスに配置する
		gameBoard.getPieces(player)
			.map(p => p.getActionPlans(gameBoard, opponentPlanBoard))
			.flat()
			.forEach(ap => {
				let {_, value} = this.get(ap.x, ap.y);
				if(!value) {
					value = {x:ap.x, y:ap.y, arr:[]}
					this.put(value);
				}
				value.arr.push(ap);
			});
	}
}

class PlanManager {
	#gameBoard;
	#planBoards = new Map();
	constructor(gameBoard) {
		this.#gameBoard = gameBoard;
		for(const player of Player.values) {
			this.#planBoards.set(player, new PlanBoard(gameBoard, player));
		}
	}
	get(player) { return this.#planBoards.get(player); }
	rebuildPlan(player) {
		const opponentPlanBoard = this.#planBoards.get(player.next);
		this.#planBoards.set(player, new PlanBoard(this.#gameBoard, player, opponentPlanBoard));
	}
}

//+方向
const P_DELTAS = Object.freeze([
	        {dx:0,dy:-1},
	 {dx:-1,dy: 0},{dx:1,dy: 0},
	        {dx:0,dy: 1}
]);
//X方向
const X_DELTAS = Object.freeze([
	{dx:-1,dy:-1},{dx:1,dy:-1},
	{dx:-1,dy: 1},{dx:1,dy: 1}
]);
//8方向
const A_DELTAS = Object.freeze([
	{dx:-1,dy:-1},{dx:0,dy:-1},{dx:1,dy:-1},
	{dx:-1,dy: 0},             {dx:1,dy: 0},
	{dx:-1,dy: 1},{dx:0,dy: 1},{dx:1,dy: 1}
]);
//ナイト
const K_DELTAS = Object.freeze([
	{dx:-1,dy:-2},{dx: 1,dy:-2},
	{dx: 2,dy:-1},{dx: 2,dy: 1},
	{dx:-1,dy: 2},{dx: 1,dy: 2},
	{dx:-2,dy:-1},{dx:-2,dy: 1}
]);

class King extends Piece {
	constructor(x, y, player) {
		super(x, y, player, 5);
	}
	getActionPlans(gameBoard, opponentPlanBoard) {
		const result = [];
		const opponentPlans = opponentPlanBoard?.get(this.x, this.y).value?.arr;
		A_DELTAS
			.map(({dx,dy}) => this.player.coordinateCorrection(this.x, this.y, dx, dy))
			.forEach(({xx, yy}) => {
				const {inside, value} = gameBoard.get(xx, yy);
				if(!inside) return; //枠の外ならダメ
				if(opponentPlanBoard?.get(xx, yy).value) return; //相手の移動(攻撃)範囲もしくはガードされている相手の駒ならダメ
				if(opponentPlans?.find(plan => plan.extraStep?.x === xx && plan.extraStep?.y === yy)) return; //直線攻撃の同じ直線上はダメ
				result.push(new ActionPlan(xx, yy, this, value)); //移動・獲得・ガード
			});
		//TODO: キャスリング
		return result;
	}
}

class Queen extends Piece {
	constructor(x, y, player) {
		super(x, y, player, 4);
	}
	getActionPlans(gameBoard) {
		return this.getStraightPlans(A_DELTAS, gameBoard);
	}
}

class Bishop extends Piece {
	constructor(x, y, player) {
		super(x, y, player, 3);
	}
	getActionPlans(gameBoard) {
		return this.getStraightPlans(X_DELTAS, gameBoard);
	}
}

class Knight extends Piece {
	constructor(x, y, player) {
		super(x, y, player, 1);
	}
	getActionPlans(gameBoard) {
		const result = [];
		K_DELTAS
			.map(({dx,dy}) => this.player.coordinateCorrection(this.x, this.y, dx, dy))
			.forEach(({xx, yy}) => {
				const {inside, value} = gameBoard.get(xx, yy);
				if(inside) result.push(new ActionPlan(xx, yy, this, value)); //移動・獲得・ガード
			});
		return result;
	}
}

class Rook extends Piece {
	constructor(x, y, player) {
		super(x, y, player, 2);
	}
	getActionPlans(gameBoard) {
		return this.getStraightPlans(P_DELTAS, gameBoard);
	}
}

class Pawn extends Piece {
	constructor(x, y, player) {
		super(x, y, player, 0);
		this.firstMove = true; //ポーンは最初の一回だけ最大2マス進める
		this.moveCount = 0;
	}
	getActionPlans(gameBoard) {
		const result = [];
		const route = []; //現在地点は含まない
		for(let i=0, xx=this.x, yy=this.y; i<(this.firstMove?2:1); i++) {
			({xx, yy} = this.player.coordinateCorrection(xx, yy, 0, -1)); //一歩前
			const {inside, value} = gameBoard.get(xx, yy);
			if(!inside || value) break; //枠外もしくは何かに当たったならそこまで
			result.push(new ActionPlan(xx, yy, this, undefined, route)); //移動
			route.push({x:xx, y:yy});
		}
		//斜め前への獲得移動
		[-1,1].forEach(dx => {
			const {xx:x1, yy:y1} = this.player.coordinateCorrection(this.x, this.y, dx, -1);
			let {inside, value} = gameBoard.get(x1, y1);
			if(!inside) return; //枠外なら無視
			if(!value) value = this.#getEnPassant(gameBoard, dx);
			result.push(new ActionPlan(x1, y1, this, value).setCaptureOnly(true)); //普通に移動は出来ないけど一応戦闘範囲
		});
		return result;
	}
	//アンパッサン(en passant)
	#getEnPassant(gameBoard, dx) {
		const {xx, yy} = this.player.coordinateCorrection(this.x, this.y, dx, 0);
		const value = gameBoard.get(xx, yy).value;
		//隣りに居るのは2マス動いた相手のポーン? 残像があるぞ!
		return value instanceof Pawn && value.player !== this.player && value.moveCount == 2 ? value : undefined;
	}
	moveTo(x, y) {
		this.moveCount = Math.abs(y-this.y);
		this.firstMove = false;
		super.moveTo(x, y);
	}
}

const PIECE_IMAGES = new Image();
PIECE_IMAGES.src = "chess.png";
const PIECE_SIZE = 15;

const BOARD_SIZE = 8;
const TILE = 45;
const CANVAS_SIZE = TILE * BOARD_SIZE;
const TILE_COLORS = Object.freeze(["#C8C8C8", "#64C8C8"]);

class BoardDrawer {
	constructor(ctx) {
		this.ctx = ctx;
		this.ctx.imageSmoothingEnabled = false;
		this.ctx.strokeStyle = "rgba(255, 255, 255, 255)";

		this.cx = undefined;
		this.cy = undefined;
		this.plans = undefined;
	}

	setCursor(cx, cy) {
		this.cx = cx;
		this.cy = cy;
	}

	setActionPlans(plans) {
		this.plans = plans;
	}

	draw(gameBoard) {
		this.ctx.clearRect(0, 0, gameBoard.w*TILE, gameBoard.h*TILE);

		for(let y=0; y<gameBoard.h; y++) {
			for(let x=0, i=y&1; x<gameBoard.w; x++, i^=1) {
				this.ctx.fillStyle = TILE_COLORS[i];
				this.ctx.fillRect(x*TILE, y*TILE, TILE, TILE);

				if(x == this.cx && y == this.cy) {
					this.ctx.fillStyle = 'rgba(255, 255, 0, 50)';
					this.ctx.fillRect(this.cx*TILE, this.cy*TILE, TILE, TILE);
				}

				const piece = gameBoard.get(x, y).value;
				if(piece) this.#drawPiece(piece, x, y);
			}
		}
		//プラン表示
		this.plans?.forEach(plan => {
			if(plan.isMovable()) this.#drawCircle(plan.x, plan.y, 'rgb(0, 255, 0)', 4.0);
			if(plan.isCapture()) {
				const target = plan.target;
				this.#drawCheckMark(target.x, target.y, 'rgb(255, 0, 0)', 4.0);
			}
		});
	}
	#drawPiece(piece, tileX, tileY) {
		const pieceImagesX = piece.imageNum;
		const pieceImagesY = piece.player.num;
		this.ctx.drawImage(PIECE_IMAGES,
				pieceImagesX*PIECE_SIZE, pieceImagesY*PIECE_SIZE, PIECE_SIZE, PIECE_SIZE,
				tileX*TILE, tileY*TILE, TILE, TILE);
	}
	#drawCircle(x, y, style, lineWidth) {
		this.ctx.strokeStyle = style;
		this.ctx.lineWidth = lineWidth;
		const xx = x * TILE + TILE/2;
		const yy = y * TILE + TILE/2;
		const r = TILE / 4;
		this.ctx.beginPath();
		this.ctx.arc(xx, yy, r, 0, Math.PI*2);
		this.ctx.stroke();
	}
	#drawCheckMark(x, y, style, lineWidth) {
		this.ctx.strokeStyle = style;
		this.ctx.lineWidth = lineWidth;
		const xx = x * TILE + 2;
		const yy = y * TILE + 2;
		const f = n => TILE * n / 8; //n=0-8
		this.ctx.beginPath();
		this.ctx.moveTo(xx+f(2), yy+f(4));
		this.ctx.lineTo(xx+f(3), yy+f(5));
		this.ctx.lineTo(xx+f(6), yy+f(2));
		this.ctx.stroke();
	}
}

window.addEventListener('load', () => init());

function init() {
	const canvas = document.getElementById('canvas');
	canvas.width = CANVAS_SIZE;
	canvas.height = CANVAS_SIZE;

	const ctx = canvas.getContext('2d');
	const boardDrawer = new BoardDrawer(ctx);

	//白コマ
	const wpawn1 = new Pawn(3,5,Player.WHITE);
	const wpawn2 = new Pawn(2,5,Player.WHITE);
	const wknight1 = new Knight(1,4,Player.WHITE);
	const wqueen = new Queen(2,7,Player.WHITE);
	const wking = new King(4,6,Player.WHITE);
	//黒コマ
	const bpawn1 = new Pawn(4,3,Player.BLACK);
	const brook1 = new Rook(0,6,Player.BLACK);
	const bknight1 = new Knight(3,3,Player.BLACK);
	const bbishop1 = new Bishop(7,4,Player.BLACK);
	const bqueen = new Queen(4,0,Player.BLACK);
	const bking = new King(3,0,Player.BLACK);
	//配置
	const gameBoard = new GameBoard();
	gameBoard.put(wpawn1);
	gameBoard.put(wpawn2);
	gameBoard.put(wknight1);
	gameBoard.put(wqueen);
	gameBoard.put(wking);
	gameBoard.put(bpawn1);
	gameBoard.put(brook1);
	gameBoard.put(bknight1);
	gameBoard.put(bbishop1);
	gameBoard.put(bqueen);
	gameBoard.put(bking);

	const planManager = new PlanManager(gameBoard);

	let player = Player.WHITE;
	planManager.rebuildPlan(player);

	const button = document.getElementById('button');
	button.disabled = false;
	button.textContent = '白 2,5 -> 2.4';
	button.addEventListener('click', () => {
		this.i = (this.i ?? 0) + 1;
		if(this.i == 1) {
			console.log('whilte 2,5 -> 2,4');
 			gameBoard.get(2,5).value.moveTo(2,4);
			button.textContent = '黒 4,3 -> 4,5';
		} else if(this.i == 2) {
			console.log('black 4,3 -> 4,5');
			gameBoard.get(4,3).value.moveTo(4,5);
			button.textContent = '終了';
			button.disabled = true; //これ以上はボタン操作は無し
		}
		planManager.rebuildPlan(player);
		boardDrawer.setActionPlans(undefined);
		boardDrawer.draw(gameBoard);

		player = player.next;
		planManager.rebuildPlan(player);
	});

	//マウスのマスを表示
	const dp =  document.getElementById('mousepos');
	canvas.addEventListener('mousemove', e => {
		const x = Math.floor(e.offsetX / TILE);
		const y = Math.floor(e.offsetY / TILE);
		if(this.x == x && this.y == y) return;
		this.x = x;
		this.y = y;

		dp.textContent = 'x: ' + x + ', y: ' + y;

		boardDrawer.setCursor(x, y);
		boardDrawer.draw(gameBoard);
	});

	//クリックでマスの情報を表示
	canvas.addEventListener('click', e => {
		const x = Math.floor(e.offsetX / TILE);
		const y = Math.floor(e.offsetY / TILE);

		const piece = gameBoard.get(x, y).value;
		console.log('(%d,%d) piece\n%o', x, y, piece);
		if(piece) {
			const plans = piece.getActionPlans(gameBoard, planManager.get(piece.player.next));
			console.log('piace plans\n%o', plans);

			boardDrawer.setActionPlans(plans);
			boardDrawer.draw(gameBoard);
		} else {
			boardDrawer.setActionPlans(undefined);
			boardDrawer.draw(gameBoard);
		}
		console.log('(%d,%d) WHITE player plans\n%o', x, y, planManager.get(Player.WHITE).get(x, y).value);
		console.log('(%d,%d) BLACK player plans\n%o', x, y, planManager.get(Player.BLACK).get(x, y).value);
	});

	//初期表示
	boardDrawer.draw(gameBoard);
}
