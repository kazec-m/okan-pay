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
const sunabarToken = process.env.sunabarToken;

// 親・子どものLINEユーザーID(環境変数から取得)
// ★これは、明日Bさんのログイン環境でuserIdを確認したあと、登録する値
const PARENT_USER_ID = process.env.PARENT_USER_ID;
const CHILD_USER_ID = process.env.CHILD_USER_ID;

// 振込に使う口座情報(環境変数から取得)
// ★これは、Bさんのsunabar環境の口座情報を、最終段階で登録する値
const parentAccountId = process.env.parentAccountId;
const childAccountNumber = process.env.childAccountNumber;
const childBranchCode = process.env.childBranchCode;
const childName = process.env.childName;

// LINEからメッセージが届いたときに実行される関数
exports.handler = async (event) => {
  // LINEから送られてきたデータを取り出す
  const body = JSON.parse(event.body);

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

      // 文章の中から数字だけを取り出す(例:「92点」→ 92)
      const score = parseInt(reqMessage.match(/\d+/)[0]);

      // ボーナス金額を入れる変数(最初は0)
      let bonusAmount = 0;

      if (score === 100) {
        bonusAmount = 1500;
      } else if (score >= 90) {
        bonusAmount = 900;
      } else if (score >= 80) {
        bonusAmount = 800;
      }
      // 79点以下は bonusAmount = 0 のまま(振込なし)

      // ---------- C担当: ボーナス金額が決まったら、sunabarの振込APIを呼び出す ----------

      if (bonusAmount > 0) {
        // 今日の日付を「2026-06-16」のような形式で自動的に作る
        // (sunabarのルールで、振込指定日は「今日以降」でないとエラーになるため)
        const today = new Date().toISOString().split("T")[0];

        // sunabarに送る「お願い状」を組み立てる
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
            // ← ★最終段階で書き換え必要!Lambdaの環境変数「parentAccountId」に本物の値を登録

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
                // ← ★最終段階で書き換え必要!Lambdaの環境変数「childBranchCode」に本物の値を登録

                accountTypeCode: "1",

                accountNumber: childAccountNumber,
                // ← ★最終段階で書き換え必要!Lambdaの環境変数「childAccountNumber」に本物の値を登録

                beneficiaryName: childName,
                // ← ★最終段階で書き換え必要!Lambdaの環境変数「childName」に本物の値を登録
              },
            ],
          }),
        };

        // sunabarに、お願い状(options)を送って、結果が返ってくるまで待つ
        const response = await requestPromise(options);
        // 返ってきた結果(文字列)を、JavaScriptが扱えるオブジェクトに変換する
        const data = JSON.parse(response.body);

        // 親への返信メッセージ(振込完了の報告+受付番号)
        resMessage =
          score +
          "点!ボーナス" +
          bonusAmount +
          "円を即時振込しました(受付番号: " +
          data.applyNo +
          ")";

        // 点数に応じて、子どもへの1個目のメッセージを変える
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

        // 2個目のメッセージ(固定文:残高確認の案内)
        const childMessage2 = "「残高」と送ると、今の貯金額を確認できるよ";

        // 子どもに、2つのメッセージを連続で送る(pushMessage = こちらから話しかける機能)
        await client.pushMessage({
          to: CHILD_USER_ID,
          messages: [
            { type: "text", text: childMessage1 },
            { type: "text", text: childMessage2 },
          ],
        });
      } else {
        // ---------- 79点以下の場合(ボーナスなし) ----------

        // 親への返信メッセージ
        resMessage = "送金保留!!!お小遣いは自宅待機中です!";

        // 子どもへの励ましメッセージ
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
      // 親以外(子どもなど)が「点」を含むメッセージを送ってきた場合
      resMessage = "権限がありません";
    }

    // ===========================================
    // ★B担当ゾーン: 「残高」という文字を受け取ったら、残高照会する
    // ===========================================
  } else if (reqMessage === "残高") {
    // ★Bさん担当:sunabarの残高照会APIを呼び出して、残高を返す処理
    // (Bさんが、この部分にコードを追加する予定)
    // 子ども以外(親など)が「残高」と送ってきた場合の対応はBさんと要相談
  }

  // LINEに返信を送る(親への返信。子どもへの通知は別途pushMessageで送信済み)
  if (resMessage !== "") {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: resMessage }],
    });
  }
};
