# q_pbspue5e0yxign
https://teratail.com/questions/pbspue5e0yxign

テキトウな盤面を想定して想定通りのデータがあるかを確認中…。

白キングをクリックすると、移動可能先として4件が出る。(3,5) は白ポーンのガードなので実際には移動できないが、残りは黒ポーンと黒ビショップの攻撃可能範囲を除く空白で移動可能。
黒ポーンを取る移動が無いのは、黒ナイトがガードしているため。(黒ポーンをクリックしてみれば bplayer plans に黒ナイトが出る。)
![clicked king](https://github.com/Jimbe-github/q_pbspue5e0yxign/assets/62501697/fc4d3455-3492-4c36-8efa-09ee2b2f0e89)

x=3,y=5 の白ポーンをクリック。
移動可能先として (3,4),(2,4),(4,4)の3件があり、(2,4) は白ポーンのガード、(4,4) は(実際にはこの位置ではあり得ないが)2マス移動した黒ポーン(x=4,y=5,moveCount=2)のアンパッサンとして取れる為移動可能としている。
また、上で書いたように白キングのガードを受けているため wplayer plans に白キングの情報が出ている。
![clicked pawn](https://github.com/Jimbe-github/q_pbspue5e0yxign/assets/62501697/f5e13144-0c43-4692-8855-c8387b8b23ed)
