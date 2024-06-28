class Player {
	constructor(imageNum) {
		this.imageNum = imageNum;
		this.next = null;
		this.planBoard = null;
	}
	//座標補正, 左上を原点とする座標内で白は下から
	coordinateCorrection(x, y, dx, dy) {
		return {xx:x+dx, yy:y+dy};
	}
	rebuildPlan(gameBoard) {
		this.planBoard = new PlanBoard(gameBoard, this);
	}
}

class WhitePlayer extends Player {
	constructor() {
		super(0);
	}
}

class BlackPlayer extends Player {
	constructor() {
		super(1);
	}
	coordinateCorrection(x, y, dx, dy) {
		return super.coordinateCorrection(x, y, -dx, -dy);
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
			for(let xx=this.x, yy=this.y; ; ) {
				({xx, yy} = this.player.coordinateCorrection(xx, yy, dx, dy));
				if(!this.pushActionPlanTo(result, gameBoard, xx, yy, route)) break;
				route.push({x:xx, y:yy});
			}
		});
		return result;
	}
	pushActionPlanTo(result, gameBoard, x, y, route) {
		const {inside, value} = gameBoard.get(x, y);
		if(!inside) return false; //枠の外なら終わり
		result.push(new ActionPlan(x, y, this, value, route)); //移動・獲得・ガード
		return !value; //何かがあったなら終わり
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
	beingCHECKed(player) {
		const king = this.getKing(player);
		return !player.next?.planBoard.get(king.x, king.y);
	}
}

class ActionPlan {
	constructor(x, y, piece, target, route=[]) {
		this.x = x; //対象位置
		this.y = y;
		this.piece = piece; //アクションするピース
		this.target = target; //対象ピース(自分の駒だったらガード対象, 相手の駒だったら取られる駒)
		this.route = structuredClone(route); //ここに来るまでに piece が通る位置{x,y}
		this.getOnly = false; //true だったら target が空でも(単なる)移動先には出来ない (Pawn の斜め前用)
	}
	setGetOnly(getOnly) {
		this.getOnly = getOnly;
		return this;
	}
}

//player 毎の次行動プラン
// 各座標には複数の Piece の ActionPlan が入る(配列)
class PlanBoard extends Board {
	constructor(gameBoard, player) {
		super(gameBoard.w, gameBoard.h);

		//player の各駒の行動を各マスに配置する
		gameBoard.getPieces(player)
			.map(p => p.getActionPlans(gameBoard, player.next?.planBoard))
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
		A_DELTAS
			.map(({dx,dy}) => this.player.coordinateCorrection(this.x, this.y, dx, dy))
			.forEach(({xx, yy}) => {
				const {inside, value} = gameBoard.get(xx, yy);
				if(!inside) return; //枠の外ならダメ
				if(opponentPlanBoard?.get(xx, yy).value) return; //相手の移動(攻撃)範囲もしくはガードされている相手の駒ならダメ
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
			.forEach(({xx, yy}) => this.pushActionPlanTo(result, gameBoard, xx, yy));
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
		this.firstMoved = false; //ポーンは最初の一回だけ最大2マス進める
		this.moveCount = 0;
	}
	getActionPlans(gameBoard) {
		const result = [];
		const route = []; //現在地点は含まない
		for(let i=0, xx=this.x, yy=this.y; i<(this.firstMoved?1:2); i++) {
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
			if(!value) value = this.getEnPassant(gameBoard, dx) ?? value;
			result.push(new ActionPlan(x1, y1, this, value).setGetOnly(true)); //普通に移動は出来ないけど一応戦闘範囲
		});
		return result;
	}
	//アンパッサン(en passant)
	getEnPassant(gameBoard, dx) {
		const {xx, yy} = this.player.coordinateCorrection(this.x, this.y, dx, 0);
		const value = gameBoard.get(xx, yy).value;
		//隣りに居るのは2マス動いた相手のポーン? 残像があるぞ!
		return value instanceof Pawn && value.player !== this.player && value.moveCount == 2 ? value : undefined;
	}
	moveTo(x, y) {
		this.moveCount = Math.abs(y-this.y);
		this.firstMoved = true;
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
	constructor(canvas) {
		canvas.width = CANVAS_SIZE;
		canvas.height = CANVAS_SIZE;

		this.ctx = canvas.getContext("2d");
		this.ctx.imageSmoothingEnabled = false;
		this.ctx.strokeStyle = "rgba(255, 255, 255, 255)";
	}

	draw(gameBoard) {
		this.ctx.clearRect(0, 0, gameBoard.w*TILE, gameBoard.h*TILE);
		for(let y=0; y<gameBoard.h; y++) {
			for(let x=0, i=y&1; x<gameBoard.w; x++, i^=1) {
				this.ctx.fillStyle = TILE_COLORS[i];
				this.ctx.fillRect(x*TILE, y*TILE, TILE, TILE);

				const piece = gameBoard.get(x, y).value;
				if(!piece) continue;
				this.ctx.drawImage(PIECE_IMAGES,
						piece.imageNum*PIECE_SIZE, piece.player.imageNum*PIECE_SIZE, PIECE_SIZE, PIECE_SIZE,
						x*TILE, y*TILE, TILE, TILE);
			}
		}
	}
}

window.addEventListener("load", () => init());

function init() {
	const canvas = document.getElementById("canvas");
	const boardDrawer = new BoardDrawer(canvas);

	//マウスのマスを表示
	const dp =  document.getElementById("mousepos");
	canvas.addEventListener("mousemove", e => {
		const x = Math.floor(e.offsetX / TILE);
		const y = Math.floor(e.offsetY / TILE);
		dp.textContent = "x: " + x + ", y: " + y;
	});

	const wplayer = new WhitePlayer();
	const bplayer = new BlackPlayer();
	wplayer.next = bplayer;	//白の次は黒
	bplayer.next = wplayer; //黒の次は白

	//白コマ
	const wpawn1 = new Pawn(3,5,wplayer);
	const wpawn2 = new Pawn(2,5,wplayer);
	const wking1 = new King(4,6,wplayer);
	//黒コマ
	const bpawn1 = new Pawn(4,3,bplayer);
	const bnight1 = new Knight(3,3,bplayer);
	const bbishop1 = new Bishop(7,4,bplayer);
	//配置
	const gameBoard = new GameBoard();
	gameBoard.put(wpawn1);
	gameBoard.put(wpawn2);
	gameBoard.put(wking1);
	gameBoard.put(bpawn1);
	gameBoard.put(bnight1);
	gameBoard.put(bbishop1);
	wplayer.rebuildPlan(gameBoard);
	bplayer.rebuildPlan(gameBoard);

	console.log('whilte 2,5 -> 2,4');
  let piece = gameBoard.get(2,5).value;
  piece.moveTo(2,4);
	piece.player.rebuildPlan(gameBoard);

	console.log('black 4,3 -> 4,5');
	piece = gameBoard.get(4,3).value;
	piece.moveTo(4,5);
	piece.player.rebuildPlan(gameBoard);

	console.log('draw');
	boardDrawer.draw(gameBoard);

	//クリックでマスの情報を表示
	canvas.addEventListener("click", e => {
		const x = Math.floor(e.offsetX / TILE);
		const y = Math.floor(e.offsetY / TILE);

		console.log('('+x+','+y+') piece');
		const piece = gameBoard.get(x, y).value;
		console.log(piece);
		if(piece) {
			console.log('piace plans');
			console.log(piece.getActionPlans(gameBoard, piece.player.next.planBoard));
		}
		console.log('('+x+','+y+') wplayer plans');
		console.log(wplayer.planBoard.get(x, y).value);
		console.log('('+x+','+y+') bplayer plans');
		console.log(bplayer.planBoard.get(x, y).value);
	});
}
