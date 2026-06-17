"use strict";

// LINEとやり取りするための道具
const line = require("@line/bot-sdk");
// 外部のAPI(銀行など)と通信するための道具
const request = require("request");
// requestを「await」で待てる形に変身させるための道具
const util = require("util");
const requestPromise = util.promisify(request);

// LINEの認証情報(Lambdaの環境変数から取得)
const config = {
  channelAccessToken: process.env.channelAccessTokenLINE,
  channelSecret: process.env.channelSecretLINE,
};

// LINEに返信するためのクライアント
const client = new line.messagingApi.MessagingApiClient(config);

// sunabar(銀行API)のアクセストークン(環境変数から取得)
const sunabarToken = process.env.sunabarToken; // 親の振込用
const sunabarToken_CHILD = process.env.sunabarToken_CHILD; // 子どもの残高照会用（ゆみゆみさん設定）

// 親・子どものLINEユーザーID(環境変数から取得)
const PARENT_USER_ID = process.env.PARENT_USER_ID;
const CHILD_USER_ID = process.env.CHILD_USER_ID;

// 振込に使う口座情報(環境変数から取得)
const parentAccountId = process.env.parentAccountId;
const childAccountNumber = process.env.childAccountNumber;
const childBranchCode = process.env.childBranchCode;
const childName = process.env.childName;

// LINEからメッセージが届いたときに実行される関数
exports.handler = async (event) => {
  try {
    // LINEから送られてきたデータを取り出す
    const body = JSON.parse(event.body);

    // 🛡️ LINEの「検証」ボタン・空イベント対策（エラーになる前にここで即終了する）
    if (!body.events || body.events.length === 0) {
      return { statusCode: 200, body: "OK" };
    }

    // 返信先を特定するためのトークン
    const replyToken = body.events[0].replyToken;
    // ユーザーが送ってきた文章
    const reqMessage = body.events[0].message.text;
    // 誰が送ってきたかを示すID
    const userId = body.events[0].source.userId;

    // 返信メッセージを入れる変数(最初は空)
    let resMessage = "";

    // ===========================================
    // ★A・C担当ゾーン: 「点」という文字が含まれていたら、テストの点数とみなす
    // ===========================================
    if (reqMessage.includes("点")) {
      // 親からのメッセージかどうかを確認する(権限チェック)
      if (userId === PARENT_USER_ID) {
        // ---------- A担当: 点数を取り出して、ボーナス金額を判定する ----------
        const score = parseInt(reqMessage.match(/\d+/)[0]);
        let bonusAmount = 0;

        if (score === 100) {
          bonusAmount = 1500;
        } else if (score >= 90) {
          bonusAmount = 900;
        } else if (score >= 80) {
          bonusAmount = 800;
        }

        // ---------- C担当: ボーナス金額が決まったら、sunabarの振込APIを呼び出す ----------
        if (bonusAmount > 0) {
          const today = new Date().toISOString().split("T")[0];

          var options = {
            method: "POST",
            url: "https://api.sunabar.gmo-aozora.com/personal/v1/transfer/request",
            headers: {
              Accept: "application/json;charset=UTF-8",
              "Content-Type": "application/json;charset=UTF-8",
              "x-access-token": sunabarToken,
            },
            body: JSON.stringify({
              accountId: parentAccountId,
              transferDesignatedDate: today,
              transferDateHolidayCode: "1",
              totalCount: "1",
              totalAmount: bonusAmount.toString(),
              transfers: [
                {
                  itemId: "1",
                  transferAmount: bonusAmount.toString(),
                  beneficiaryBankCode: "0310",
                  beneficiaryBranchCode: childBranchCode,
                  accountTypeCode: "1",
                  accountNumber: childAccountNumber,
                  beneficiaryName: childName,
                },
              ],
            }),
          };

          const response = await requestPromise(options);
          const data = JSON.parse(response.body);

          // 親への返信メッセージ
          resMessage =
            score +
            "点!ボーナス" +
            bonusAmount +
            "円を即時振込しました(受付番号: " +
            data.applyNo +
            ")";

          // 子どもへの1個目のメッセージ
          let childMessage1 = "";
          if (score === 100) {
            childMessage1 =
              "🎉🎉🎉 神ってる!!\n100点なんて、もうオカン泣いちゃう!\nボーナス1500円、即決定で振り込んだよ!";
          } else if (score >= 90) {
            childMessage1 =
              "✨ すごいじゃん!!\n" +
              score +
              "点だなんて、よく頑張ったね!\nボーナス900円、即振込しといたよ〜";
          } else if (score >= 80) {
            childMessage1 =
              "👍 おお、いいね!\n" +
              score +
              "点、まずまずの結果!\nボーナス800円、ちゃんと振込済みです";
          }

          const childMessage2 = "「残高」と送ると、今の貯金額を確認できるよ";

          // 子どもに通知を飛ばす
          await client.pushMessage({
            to: CHILD_USER_ID,
            messages: [
              { type: "text", text: childMessage1 },
              { type: "text", text: childMessage2 },
            ],
          });
        } else {
          // ---------- 79点以下の場合(ボーナスなし) ----------
          resMessage = "送金保留!!!お小遣いは自宅待機中です!";

          const childMessage1 =
            "😅 う〜ん、今回は厳しめ採点しちゃうよ!\n" +
            score +
            "点か〜、次は期待してるからね!\n今回はボーナスなし、また頑張ろう!";
          const childMessage2 = "「残高」と送ると、今の貯金額を確認できるよ";

          await client.pushMessage({
            to: CHILD_USER_ID,
            messages: [
              { type: "text", text: childMessage1 },
              { type: "text", text: childMessage2 },
            ],
          });
        }
      } else {
        resMessage = "権限がありません";
      }

      // ===========================================
      // ★B担当ゾーン: 「残高」という文字を受け取ったら、残高照会する
      // ===========================================
    } else if (reqMessage === "残高") {
      // 子どものアカウントから残高を取得
      var balanceOptions = {
        method: "GET",
        url: "https://api.sunabar.gmo-aozora.com/personal/v1/accounts/balances",
        headers: {
          "x-access-token": sunabarToken_CHILD,
        },
      };

      const balanceResponse = await requestPromise(balanceOptions);
      const sunabarData = JSON.parse(balanceResponse.body);

      const balance = Number(sunabarData.spAccountBalances[0].odBalance);
      const formattedBalance = balance.toLocaleString();

      // 🐣 ひよこ育成ロジック
      let character = "🥚";
      let stageName = "たまご";

      if (balance >= 5000) {
        character = "👑";
        stageName = "キングにわとり";
      } else if (balance >= 3000) {
        character = "🐔";
        stageName = "にわとり";
      } else if (balance >= 1000) {
        character = "🐣";
        stageName = "ひよこ";
      }

      resMessage = `いまの残高は ${formattedBalance} 円だよ！\n現在の成長ステージ：【${stageName} ${character}】`;
    } else {
      // 「点」でも「残高」でもない日常会話のとき
      resMessage = `「${reqMessage}」だね！「残高」って送るか、「92点」みたいに点数を送ってみてね。`;
    }

    // LINEに親への返信を送る
    if (resMessage !== "") {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: resMessage }],
      });
    }

    return { statusCode: 200, body: "OK" };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: "Error" };
  }
};
