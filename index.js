// sunabar(銀行API)のアクセストークン(環境変数から取得)
const sunabarToken = process.env.sunabarToken; // 親の振込用
const sunabarToken_CHILD = process.env.sunabarToken_CHILD; // 子どもの残高照会用

// 親・子どものLINEユーザーID(環境変数から取得)
const PARENT_USER_ID = process.env.PARENT_USER_ID;
const CHILD_USER_ID = process.env.CHILD_USER_ID;

// 振込に使う口座情報(環境変数から取得)
const parentAccountId = process.env.parentAccountId;
const childAccountNumber = process.env.childAccountNumber;
const childBranchCode = process.env.childBranchCode;
const childName = process.env.childName;

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    // 🛡️ LINEの「検証」ボタン・空イベント対策
    if (!body.events || body.events.length === 0) {
      return { statusCode: 200, body: "OK" };
    }

    const replyToken = body.events[0].replyToken;
    const reqMessage = body.events[0].message.text;
    const userId = body.events[0].source.userId;

    console.log("受信したuserId:", userId);
    console.log("環境変数のPARENT_USER_ID:", PARENT_USER_ID);

    let resMessage = "";

    // ===========================================
    // ★A・C担当ゾーン: 「点」という文字が含まれていたら、テストの点数とみなす
    // ===========================================
    if (reqMessage.includes("点")) {
      if (userId === PARENT_USER_ID) {
        // ---------- A担当: 点数判定 ----------
        const score = parseInt(reqMessage.match(/\d+/)[0]);
        let bonusAmount = 0;

        if (score === 100) {
          bonusAmount = 1500;
        } else if (score >= 90) {
          bonusAmount = 900;
        } else if (score >= 80) {
          bonusAmount = 800;
        }

        // ---------- C担当: sunabar振込処理 ----------
        if (bonusAmount > 0) {
          const today = new Date().toISOString().split("T")[0];

          const response = await fetch(
            "https://api.sunabar.gmo-aozora.com/personal/v1/transfer/request",
            {
              method: "POST",
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
            },
          );
          const data = await response.json();

          resMessage = `${score}点!ボーナス${bonusAmount}円を即時振込しました(受付番号: ${data.applyNo || "なし"})`;

          let childMessage1 = "";
          if (score === 100) {
            childMessage1 =
              "🎉🎉🎉 神ってる!!\n100点なんて、もうオカン泣いちゃう!\nボーナス1500円、即決定で振り込んだよ!";
          } else if (score >= 90) {
            childMessage1 = `✨ すごいじゃん!!\n${score}点だなんて、よく頑張ったね!\nボーナス900円、即振込しといたよ〜`;
          } else if (score >= 80) {
            childMessage1 = `👍 おお、いいね!\n${score}点、まずまずの結果!\nボーナス800円、ちゃんと振込済みです`;
          }
          const childMessage2 = "「残高」と送ると、今の貯金額を確認できるよ";

          await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.channelAccessTokenLINE}`,
            },
            body: JSON.stringify({
              to: CHILD_USER_ID,
              messages: [
                { type: "text", text: childMessage1 },
                { type: "text", text: childMessage2 },
              ],
            }),
          });
        } else {
          // ---------- 79点以下の場合(ボーナスなし) ----------
          resMessage = "送金保留します";

          const childMessage1 = "送金保留!!!お小遣いは自宅待機中です!";
          const childMessage2 = "「残高」と送ると、今の貯金額を確認できるよ";

          await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.channelAccessTokenLINE}`,
            },
            body: JSON.stringify({
              to: CHILD_USER_ID,
              messages: [
                { type: "text", text: childMessage1 },
                { type: "text", text: childMessage2 },
              ],
            }),
          });
        }
      } else {
        resMessage = "権限がありません";
      }

      // ===========================================
      // ★新規追加ゾーン: 「金額表」と送られたら、フレックスメッセージで金額表を返す
      // ===========================================
    } else if (reqMessage === "金額表") {
      await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.channelAccessTokenLINE}`,
        },
        body: JSON.stringify({
          replyToken: replyToken,
          messages: [
            {
              type: "flex",
              altText: "オカンPay ボーナス金額表",
              contents: {
                type: "bubble",
                size: "kilo",
                header: {
                  type: "box",
                  layout: "vertical",
                  backgroundColor: "#FF6B6B",
                  paddingAll: "md",
                  contents: [
                    {
                      type: "text",
                      text: "オカンPay ボーナス金額表",
                      color: "#FFFFFF",
                      weight: "bold",
                      size: "md",
                      align: "center",
                      wrap: true,
                    },
                  ],
                },
                body: {
                  type: "box",
                  layout: "vertical",
                  spacing: "md",
                  contents: [
                    {
                      type: "box",
                      layout: "horizontal",
                      contents: [
                        { type: "text", text: "💮 100点", size: "md", flex: 3 },
                        {
                          type: "text",
                          text: "1,500円",
                          size: "md",
                          align: "end",
                          weight: "bold",
                          flex: 2,
                        },
                      ],
                    },
                    {
                      type: "box",
                      layout: "horizontal",
                      contents: [
                        {
                          type: "text",
                          text: "🌸 90〜99点",
                          size: "md",
                          flex: 3,
                        },
                        {
                          type: "text",
                          text: "900円",
                          size: "md",
                          align: "end",
                          weight: "bold",
                          flex: 2,
                        },
                      ],
                    },
                    {
                      type: "box",
                      layout: "horizontal",
                      contents: [
                        {
                          type: "text",
                          text: "🌸 80〜89点",
                          size: "md",
                          flex: 3,
                        },
                        {
                          type: "text",
                          text: "800円",
                          size: "md",
                          align: "end",
                          weight: "bold",
                          flex: 2,
                        },
                      ],
                    },
                    {
                      type: "box",
                      layout: "horizontal",
                      contents: [
                        {
                          type: "text",
                          text: "👻 79点以下",
                          size: "md",
                          flex: 3,
                        },
                        {
                          type: "text",
                          text: "送金保留",
                          size: "md",
                          align: "end",
                          weight: "bold",
                          flex: 2,
                        },
                      ],
                    },
                    { type: "separator", margin: "md" },
                    {
                      type: "text",
                      text: "がんばってー!!",
                      align: "center",
                      weight: "bold",
                      color: "#FF6B6B",
                      margin: "md",
                    },
                  ],
                },
              },
            },
          ],
        }),
      });
      return { statusCode: 200, body: "OK" };

      // ===========================================
      // ★B担当ゾーン（ゆみゆみさん）: 残高照会
      // 親なら親子両方、子どもなら子どもの残高のみ表示
      // ===========================================
    } else if (reqMessage === "残高") {
      if (userId === PARENT_USER_ID) {
        // ---------- 親の場合: 親と子、両方の残高を表示 ----------
        const parentResponse = await fetch(
          "https://api.sunabar.gmo-aozora.com/personal/v1/accounts/balances",
          {
            method: "GET",
            headers: { "x-access-token": sunabarToken },
          },
        );
        const parentData = await parentResponse.json();
        const parentBalance = Number(parentData.spAccountBalances[0].odBalance);

        const childResponse = await fetch(
          "https://api.sunabar.gmo-aozora.com/personal/v1/accounts/balances",
          {
            method: "GET",
            headers: { "x-access-token": sunabarToken_CHILD },
          },
        );
        const childData = await childResponse.json();
        const childBalance = Number(childData.spAccountBalances[0].odBalance);

        resMessage = `【親】残高: ${parentBalance.toLocaleString()}円\n【子ども】残高: ${childBalance.toLocaleString()}円`;
      } else if (userId === CHILD_USER_ID) {
        // ---------- 子どもの場合: 子どもの残高のみ表示(ひよこ育成つき) ----------
        const sunabarResponse = await fetch(
          "https://api.sunabar.gmo-aozora.com/personal/v1/accounts/balances",
          {
            method: "GET",
            headers: { "x-access-token": sunabarToken_CHILD },
          },
        );
        const sunabarData = await sunabarResponse.json();

        const balance = Number(sunabarData.spAccountBalances[0].odBalance);
        const formattedBalance = balance.toLocaleString();

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
        resMessage = "権限がありません";
      }
    } else {
      resMessage = `「${reqMessage}」だね！「残高」って送るか、「92点」みたいに点数を送ってみてね。`;
    }

    // LINEへの返信（リプライ）
    if (resMessage !== "") {
      await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.channelAccessTokenLINE}`,
        },
        body: JSON.stringify({
          replyToken: replyToken,
          messages: [{ type: "text", text: resMessage }],
        }),
      });
    }

    return { statusCode: 200, body: "OK" };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: "Error" };
  }
};
