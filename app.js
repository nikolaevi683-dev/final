const SUPABASE_URL = "https://yehqvwojjaqfjmxumxkv.supabase.co";
const SUPABASE_KEY = "sb_publishable_eD0UIwWs0FeUb1pHYrCulA_1gOb4BMy";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

let trades = [];
let direction = "LONG";
let selectedTrade = null;

let currentCalendarDate = new Date();


/* =========================
   ЗАПУСК
========================= */

async function init() {

    // Сначала проверяем существующую сессию
    const {
        data: { session }
    } = await db.auth.getSession();

    if (!session) {

        const { data, error } =
            await db.auth.signInAnonymously();

        if (error) {
            console.error("Auth error:", error);
            alert("Ошибка подключения к аккаунту");
            return;
        }

        console.log(
            "Пользователь подключен:",
            data.user.id
        );

    } else {

        console.log(
            "Существующий пользователь:",
            session.user.id
        );
    }

    await loadTrades();

    renderCalendar();
    updateProfile();
}


/* =========================
   НАВИГАЦИЯ
========================= */

function showHome() {

    document.getElementById("homePage")
        .classList.remove("hidden");

    document.getElementById("profilePage")
        .classList.add("hidden");

    document.getElementById("tradePage")
        .classList.add("hidden");

    document.getElementById("tradeDetails")
        .classList.add("hidden");

    document.getElementById("homeNav")
        .classList.add("active");

    document.getElementById("profileNav")
        .classList.remove("active");

    renderCalendar();
}


function showProfile() {

    document.getElementById("homePage")
        .classList.add("hidden");

    document.getElementById("profilePage")
        .classList.remove("hidden");

    document.getElementById("tradePage")
        .classList.add("hidden");

    document.getElementById("tradeDetails")
        .classList.add("hidden");

    document.getElementById("homeNav")
        .classList.remove("active");

    document.getElementById("profileNav")
        .classList.add("active");

    updateProfile();
}


/* =========================
   ФОРМА СДЕЛКИ
========================= */

function openTradeForm() {

    document.getElementById("homePage")
        .classList.add("hidden");

    document.getElementById("profilePage")
        .classList.add("hidden");

    document.getElementById("tradePage")
        .classList.remove("hidden");
}


function closeTradeForm() {

    document.getElementById("tradePage")
        .classList.add("hidden");

    document.getElementById("homePage")
        .classList.remove("hidden");

    document.getElementById("formTitle")
        .textContent = "Новая сделка";

    clearForm();
}


/* =========================
   LONG / SHORT
========================= */

function setDirection(value) {

    direction = value;

    document.getElementById("longButton")
        .classList.remove("active");

    document.getElementById("shortButton")
        .classList.remove("active");

    if (value === "LONG") {

        document.getElementById("longButton")
            .classList.add("active");

    } else {

        document.getElementById("shortButton")
            .classList.add("active");
    }
}


/* =========================
   СОХРАНЕНИЕ СДЕЛКИ
========================= */

async function saveTrade() {

    const symbol =
        document.getElementById("symbol").value.trim();

    const entry =
        document.getElementById("entry").value;

    const exit =
        document.getElementById("exit").value;

    const stopLoss =
        document.getElementById("stopLoss").value;

    const takeProfit =
        document.getElementById("takeProfit").value;

    const pnl =
        document.getElementById("pnl").value;

    const comment =
        document.getElementById("comment").value.trim();


    if (!symbol || !entry || !exit || !pnl) {

        alert("Заполни обязательные поля.");
        return;
    }


    const {
        data: { user }
    } = await db.auth.getUser();


    if (!user) {

        alert("Пользователь не найден.");
        return;
    }


    const trade = {

        user_id: user.id,

        symbol: symbol.toUpperCase(),

        direction: direction,

        entry: Number(entry),

        exit: Number(exit),

        stop_loss:
            Number(stopLoss) || null,

        take_profit:
            Number(takeProfit) || null,

        pnl: Number(pnl),

        comment: comment,

        trade_date:
            new Date().toISOString().split("T")[0]
    };


    const { error } = await db
        .from("trades")
        .insert(trade);


    if (error) {

        console.error(
            "Save error:",
            error
        );

        alert(
            "Ошибка сохранения сделки: " +
            error.message
        );

        return;
    }


    clearForm();

    await loadTrades();

    closeTradeForm();

    alert("Сделка сохранена!");
}


/* =========================
   ЗАГРУЗКА СДЕЛОК
========================= */

async function loadTrades() {

    const {
        data: { user }
    } = await db.auth.getUser();


    if (!user) return;


    const {
        data,
        error
    } = await db
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", {
            ascending: false
        });


    if (error) {

        console.error(
            "Load error:",
            error
        );

        return;
    }


    trades = data || [];

    renderCalendar();

    updateProfile();
}


/* =========================
   ОЧИСТКА ФОРМЫ
========================= */

function clearForm() {

    document.getElementById("symbol").value = "";

    document.getElementById("entry").value = "";

    document.getElementById("exit").value = "";

    document.getElementById("stopLoss").value = "";

    document.getElementById("takeProfit").value = "";

    document.getElementById("pnl").value = "";

    document.getElementById("comment").value = "";

    setDirection("LONG");
}


/* =========================
   КАЛЕНДАРЬ
========================= */

function renderCalendar() {

    const calendar =
        document.getElementById("calendar");

    const monthTitle =
        document.getElementById("calendarMonth");


    if (!calendar || !monthTitle) return;


    calendar.innerHTML = "";


    const year =
        currentCalendarDate.getFullYear();

    const month =
        currentCalendarDate.getMonth();


    const monthNames = [

        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь"

    ];


    monthTitle.textContent =
        monthNames[month] + " " + year;


    // Первый день месяца
    let firstDay =
        new Date(year, month, 1).getDay();


    // Переводим воскресенье с 0 на 7
    if (firstDay === 0) {
        firstDay = 7;
    }


    // Количество дней
    const daysInMonth =
        new Date(year, month + 1, 0).getDate();


    // Пустые клетки перед первым днём
    for (
        let i = 1;
        i < firstDay;
        i++
    ) {

        const empty =
            document.createElement("div");

        empty.className =
            "calendar-day empty-day";

        calendar.appendChild(empty);
    }


    // Дни месяца
    for (
        let day = 1;
        day <= daysInMonth;
        day++
    ) {

        const dateString =
            formatDate(year, month + 1, day);


        const dayTrades =
            trades.filter(
                trade =>
                    trade.trade_date === dateString
            );


        const totalPnl =
            dayTrades.reduce(
                (sum, trade) =>
                    sum + Number(trade.pnl),
                0
            );


        const dayElement =
            document.createElement("div");

        dayElement.className =
            "calendar-day";


        // Сегодня
        const today =
            new Date();

        const todayString =
            formatDate(
                today.getFullYear(),
                today.getMonth() + 1,
                today.getDate()
            );


        if (dateString === todayString) {

            dayElement.classList.add("today");
        }


        // Профит / убыток
        if (dayTrades.length > 0) {

            if (totalPnl > 0) {

                dayElement.classList.add("profit");

            } else if (totalPnl < 0) {

                dayElement.classList.add("loss");
            }
        }


        let pnlText = "";


        if (dayTrades.length > 0) {

            pnlText =
                totalPnl > 0
                    ? "+" + totalPnl + " ₽"
                    : totalPnl + " ₽";
        }


        dayElement.innerHTML = `

            <div class="calendar-number">
                ${day}
            </div>

            <div class="calendar-pnl">
                ${pnlText}
            </div>

        `;


        dayElement.onclick = function () {

            showDayTrades(
                dateString,
                day
            );
        };


        calendar.appendChild(dayElement);
    }
}


/* =========================
   ПЕРЕКЛЮЧЕНИЕ МЕСЯЦА
========================= */

function changeMonth(step) {

    currentCalendarDate =
        new Date(
            currentCalendarDate.getFullYear(),
            currentCalendarDate.getMonth() + step,
            1
        );


    renderCalendar();


    document.getElementById("dayTrades")
        .classList.add("hidden");
}


/* =========================
   ДАТА
========================= */

function formatDate(
    year,
    month,
    day
) {

    return (
        year +
        "-" +
        String(month).padStart(2, "0") +
        "-" +
        String(day).padStart(2, "0")
    );
}


/* =========================
   СДЕЛКИ ЗА ДЕНЬ
========================= */

function showDayTrades(
    dateString,
    day
) {

    const container =
        document.getElementById("dayTrades");

    const title =
        document.getElementById("selectedDayTitle");

    const list =
        document.getElementById("selectedDayList");


    const dayTrades =
        trades.filter(
            trade =>
                trade.trade_date === dateString
        );


    title.textContent =
        "Сделки · " + day;


    list.innerHTML = "";


    if (dayTrades.length === 0) {

        list.innerHTML = `
            <div class="empty">
                Сделок в этот день нет
            </div>
        `;

    } else {

        dayTrades.forEach(
            trade => {

                list.appendChild(
                    createTradeCard(trade)
                );
            }
        );
    }


    container.classList.remove("hidden");
}


/* =========================
   КАРТОЧКА СДЕЛКИ
========================= */

function createTradeCard(trade) {

    const item =
        document.createElement("div");

    item.className = "card";


    const pnl =
        Number(trade.pnl);


    const pnlText =
        pnl > 0
            ? "+" + pnl + " ₽"
            : pnl + " ₽";


    item.innerHTML = `

        <span>
            ${formatReadableDate(
                trade.trade_date
            )}
        </span>

        <strong>
            ${trade.symbol}
        </strong>

        <div style="margin-top: 8px;">
            ${trade.direction}
            ·
            <b>
                ${pnlText}
            </b>
        </div>

    `;


    item.onclick = function () {

        openTradeDetails(trade);
    };


    return item;
}


/* =========================
   ПРОФИЛЬ
========================= */

function updateProfile() {

    const today =
        new Date().toISOString().split("T")[0];


    const todayPnl =
        trades
            .filter(
                trade =>
                    trade.trade_date === today
            )
            .reduce(
                (sum, trade) =>
                    sum + Number(trade.pnl),
                0
            );


    const totalPnl =
        trades.reduce(
            (sum, trade) =>
                sum + Number(trade.pnl),
            0
        );


    const wins =
        trades.filter(
            trade =>
                Number(trade.pnl) > 0
        ).length;


    const losses =
        trades.filter(
            trade =>
                Number(trade.pnl) < 0
        ).length;


    const winRate =
        trades.length > 0
            ? Math.round(
                wins / trades.length * 100
            )
            : 0;


    document.getElementById(
        "profileTodayPnl"
    ).textContent =
        formatPnl(todayPnl);


    document.getElementById(
        "profileTotalPnl"
    ).textContent =
        formatPnl(totalPnl);


    document.getElementById(
        "profileTrades"
    ).textContent =
        trades.length;


    document.getElementById(
        "profileWins"
    ).textContent =
        wins;


    document.getElementById(
        "profileLosses"
    ).textContent =
        losses;


    document.getElementById(
        "profileWinRate"
    ).textContent =
        winRate + "%";


    renderProfileTrades();
}


/* =========================
   ВСЕ СДЕЛКИ В ПРОФИЛЕ
========================= */

function renderProfileTrades() {

    const list =
        document.getElementById(
            "profileTradesList"
        );


    if (!list) return;


    list.innerHTML = "";


    if (trades.length === 0) {

        list.innerHTML = `
            <div class="empty">
                Сделок пока нет
            </div>
        `;

        return;
    }


    trades.forEach(
        trade => {

            list.appendChild(
                createTradeCard(trade)
            );
        }
    );
}


/* =========================
   ФОРМАТ ПРОФИТА
========================= */

function formatPnl(value) {

    const number =
        Number(value);


    if (number > 0) {

        return "+" +
            number.toLocaleString("ru-RU") +
            " ₽";
    }


    return (
        number.toLocaleString("ru-RU") +
        " ₽"
    );
}


/* =========================
   ДАТА ДЛЯ ОТОБРАЖЕНИЯ
========================= */

function formatReadableDate(
    dateString
) {

    if (!dateString) return "—";


    const parts =
        dateString.split("-");


    const year =
        Number(parts[0]);

    const month =
        Number(parts[1]);

    const day =
        Number(parts[2]);


    const months = [

        "января",
        "февраля",
        "марта",
        "апреля",
        "мая",
        "июня",
        "июля",
        "августа",
        "сентября",
        "октября",
        "ноября",
        "декабря"

    ];


    return (
        day +
        " " +
        months[month - 1] +
        " " +
        year
    );
}


/* =========================
   ДЕТАЛИ СДЕЛКИ
========================= */

function openTradeDetails(trade) {

    selectedTrade = trade;


    document.getElementById("homePage")
        .classList.add("hidden");

    document.getElementById("profilePage")
        .classList.add("hidden");

    document.getElementById("tradePage")
        .classList.add("hidden");

    document.getElementById("tradeDetails")
        .classList.remove("hidden");


    document.getElementById(
        "detailsSymbol"
    ).textContent =
        trade.symbol;


    document.getElementById(
        "detailsDate"
    ).textContent =
        formatReadableDate(
            trade.trade_date
        );


    document.getElementById(
        "detailsDirection"
    ).textContent =
        trade.direction;


    document.getElementById(
        "detailsEntry"
    ).textContent =
        trade.entry ?? "—";


    document.getElementById(
        "detailsExit"
    ).textContent =
        trade.exit ?? "—";


    document.getElementById(
        "detailsStopLoss"
    ).textContent =
        trade.stop_loss ?? "—";


    document.getElementById(
        "detailsTakeProfit"
    ).textContent =
        trade.take_profit ?? "—";


    document.getElementById(
        "detailsPnl"
    ).textContent =
        formatPnl(trade.pnl);


    document.getElementById(
        "detailsComment"
    ).textContent =
        trade.comment || "—";
}


/* =========================
   НАЗАД ИЗ ДЕТАЛЕЙ
========================= */

function closeTradeDetails() {

    selectedTrade = null;


    document.getElementById("tradeDetails")
        .classList.add("hidden");


    document.getElementById("homePage")
        .classList.remove("hidden");


    renderCalendar();
}


/* =========================
   РЕДАКТИРОВАНИЕ
========================= */

function editTrade() {

    if (!selectedTrade) return;


    document.getElementById(
        "tradeDetails"
    ).classList.add("hidden");


    document.getElementById(
        "tradePage"
    ).classList.remove("hidden");


    document.getElementById(
        "formTitle"
    ).textContent =
        "Изменить сделку";


    document.getElementById(
        "symbol"
    ).value =
        selectedTrade.symbol;


    document.getElementById(
        "entry"
    ).value =
        selectedTrade.entry;


    document.getElementById(
        "exit"
    ).value =
        selectedTrade.exit;


    document.getElementById(
        "stopLoss"
    ).value =
        selectedTrade.stop_loss || "";


    document.getElementById(
        "takeProfit"
    ).value =
        selectedTrade.take_profit || "";


    document.getElementById(
        "pnl"
    ).value =
        selectedTrade.pnl;


    document.getElementById(
        "comment"
    ).value =
        selectedTrade.comment || "";


    setDirection(
        selectedTrade.direction
    );


    const saveButton =
        document.querySelector(
            ".save-button"
        );


    saveButton.textContent =
        "Сохранить изменения";


    saveButton.onclick =
        updateTrade;
}


/* =========================
   ОБНОВЛЕНИЕ СДЕЛКИ
========================= */

async function updateTrade() {

    if (!selectedTrade) return;


    const symbol =
        document.getElementById("symbol")
            .value.trim();

    const entry =
        document.getElementById("entry").value;

    const exit =
        document.getElementById("exit").value;

    const stopLoss =
        document.getElementById("stopLoss").value;

    const takeProfit =
        document.getElementById("takeProfit").value;

    const pnl =
        document.getElementById("pnl").value;

    const comment =
        document.getElementById("comment")
            .value.trim();


    if (!symbol || !entry || !exit || !pnl) {

        alert(
            "Заполни обязательные поля."
        );

        return;
    }


    const updatedTrade = {

        symbol:
            symbol.toUpperCase(),

        direction:
            direction,

        entry:
            Number(entry),

        exit:
            Number(exit),

        stop_loss:
            Number(stopLoss) || null,

        take_profit:
            Number(takeProfit) || null,

        pnl:
            Number(pnl),

        comment:
            comment
    };


    const {
        error
    } = await db
        .from("trades")
        .update(updatedTrade)
        .eq(
            "id",
            selectedTrade.id
        );


    if (error) {

        console.error(
            "Update error:",
            error
        );

        alert(
            "Ошибка изменения сделки: " +
            error.message
        );

        return;
    }


    selectedTrade = null;


    resetSaveButton();

    clearForm();


    await loadTrades();


    document.getElementById(
        "tradePage"
    ).classList.add("hidden");


    document.getElementById(
        "homePage"
    ).classList.remove("hidden");


    alert("Сделка изменена!");
}


/* =========================
   ВОССТАНОВИТЬ КНОПКУ
========================= */

function resetSaveButton() {

    const saveButton =
        document.querySelector(
            ".save-button"
        );


    if (!saveButton) return;


    saveButton.textContent =
        "Сохранить сделку";


    saveButton.onclick =
        saveTrade;
}


/* =========================
   УДАЛЕНИЕ
========================= */

async function deleteTrade() {

    if (!selectedTrade) return;


    const confirmed =
        confirm(
            "Удалить эту сделку?"
        );


    if (!confirmed) return;


    const {
        error
    } = await db
        .from("trades")
        .delete()
        .eq(
            "id",
            selectedTrade.id
        );


    if (error) {

        console.error(
            "Delete error:",
            error
        );

        alert(
            "Ошибка удаления сделки: " +
            error.message
        );

        return;
    }


    selectedTrade = null;


    await loadTrades();


    document.getElementById(
        "tradeDetails"
    ).classList.add("hidden");


    document.getElementById(
        "homePage"
    ).classList.remove("hidden");


    alert("Сделка удалена!");
}


/* =========================
   ЗАПУСК
========================= */

init();