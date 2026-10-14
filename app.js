const SUPABASE_URL = "https://yehqvwojjaqfjmxumxkv.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_eD0UIwWs0FeUb1pHYrCulA_1gOb4BMy";


const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


// =========================================
// GLOBAL VARIABLES
// =========================================

let trades = [];

let direction = "LONG";

let selectedTrade = null;

let selectedCalendarDate = null;

let formTradeDate = null;

let currentCalendarDate = new Date();

let selectedPeriod = "today";

let currentCurrency = "RUB";

let lastRatesUpdate = null;

let detailsReturnPage = "home";

// =========================================
// CURRENCY DATA
// =========================================

const currencyData = {
    RUB: { symbol: "₽", name: "Рубль" },
    USD: { symbol: "$", name: "Доллар" },
    EUR: { symbol: "€", name: "Евро" }
};

// Базовая валюта - РУБ
// Курсы к рублю (актуальные на 12.09.2026)
const exchangeRates = {
    RUB: 1,           // 1 рубль = 1 рублю
    USD: 100,         // 1 доллар = 100 рублей
    EUR: 115          // 1 евро = 115 рублей
};


// =========================================
// INIT
// =========================================

// =========================================
// AUTH
// =========================================

let appStarted = false;

db.auth.onAuthStateChange(
    (event, session) => {

        if (session && !appStarted) {

            appStarted = true;

            document
                .getElementById("authPage")
                .classList.add("hidden");

            setTimeout(startApp, 0); // вне колбэка, чтобы не словить дедлок supabase-js

            return;
        }


        if (!session && !appStarted) {

            document
                .getElementById("homePage")
                .classList.add("hidden");

            document
                .getElementById("authPage")
                .classList.remove("hidden");
        }
    }
);


async function continueAsGuest() {

    document
        .getElementById("authPage")
        .classList.add("hidden");


    const { error } =
        await db.auth.signInAnonymously();


    if (error) {

        console.error(
            "Auth error:",
            error
        );

        alert(
            "Ошибка подключения к аккаунту"
        );
    }
}


async function linkEmail() {

    const email =
        document
            .getElementById("linkEmailInput")
            .value
            .trim();


    if (!email) {

        showAuthStatus(
            "accountStatus",
            "Введите email",
            true
        );

        return;
    }


    const button =
        document.getElementById(
            "linkEmailButton"
        );

    button.disabled = true;

    button.textContent =
        "Отправляем...";


    const { error } =
        await db.auth.updateUser({
            email
        });


    button.disabled = false;

    button.textContent =
        "Привязать email";


    if (error) {

        console.error(
            "Link email error:",
            error
        );

        showAuthStatus(
            "accountStatus",
            "Не удалось привязать: " +
                error.message,
            true
        );

        return;
    }


    showAuthStatus(
        "accountStatus",
        "Проверьте почту " +
            email +
            " и перейдите по ссылке, чтобы подтвердить."
    );
}


function showAuthStatus(
    elementId,
    message,
    isError
) {

    const element =
        document.getElementById(
            elementId
        );

    element.textContent = message;

    element.classList.remove(
        "hidden"
    );

    element.classList.toggle(
        "error",
        Boolean(isError)
    );
}


async function updateAccountSection() {

    const {
        data: { user }
    } = await db.auth.getUser();


    if (!user) {
        return;
    }


    const statusElement =
        document.getElementById(
            "accountEmailStatus"
        );

    const formElement =
        document.getElementById(
            "accountLinkForm"
        );


    if (user.email) {

        statusElement.textContent =
            user.email;

        formElement.classList.add(
            "hidden"
        );

    } else {

        statusElement.textContent =
            "Не привязан";

        formElement.classList.remove(
            "hidden"
        );
    }
}


// =========================================
// INIT
// =========================================

async function startApp() {

    console.log(
        "Пользователь подключен"
    );

    initTheme();

    loadExchangeRates();

    loadCurrency();

    // Пытаемся обновить курсы с API при запуске
    // Но не блокируем приложение если API недоступен
    maybeAutoUpdateRates();

    // Дополнительно проверяем раз в час, пока приложение открыто,
    // не устарел ли курс (на случай если вкладка не перезагружается)
    setInterval(
        maybeAutoUpdateRates,
        60 * 60 * 1000
    );

    await loadTrades();

    renderCalendar();

    updateProfile();

    updateAccountSection();

    document
        .getElementById("homePage")
        .classList.remove("hidden");

    // Незаметно, в фоне, подтягиваем новые сделки из Т-Инвестиций при
    // каждом входе в приложение — если брокер ещё не подключён или
    // временно недоступен, просто тихо ничего не делаем (без сообщений
    // об ошибке пользователю), чтобы не мешать обычному открытию приложения.
    refreshApiBanner();

    autoSyncTinkoffTrades();
}


async function autoSyncTinkoffTrades() {

    try {

        const {
            data: { session }
        } = await db.auth.getSession();

        if (!session) return;

        const syncKey = "lastAutoSync:" + session.user.id;

        if (Date.now() - Number(localStorage.getItem(syncKey) || 0) < 10 * 60 * 1000) {
            return;
        }

        localStorage.setItem(syncKey, String(Date.now()));

        const res =
            await fetch(
                functionsUrl(
                    "sync-tinkoff-trades"
                ),
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                        Authorization:
                            "Bearer " +
                            session.access_token
                    },
                    body: JSON.stringify({})
                }
            );

        const result =
            await res.json();

        if (!res.ok) {
            // Например, брокер ещё не подключён, или временная проблема
            // сети/API брокера — молча пропускаем, это фоновая операция.
            console.log(
                "autoSyncTinkoffTrades: пропущено —",
                result.error
            );

            return;
        }

        if (result.imported > 0) {

            await loadTrades();

            renderCalendar();

            updateProfile();

            showAuthStatus(
                "tinkoffStatus",
                "Импортировано новых сделок: " +
                    result.imported
            );
        }

    } catch (e) {

        console.log(
            "autoSyncTinkoffTrades error (проигнорировано):",
            e
        );
    }
}


// =========================================
// NAVIGATION
// =========================================

function showHome() {

    hidePortfolioPage();

    document
        .getElementById("homePage")
        .classList.remove("hidden");


    document
        .getElementById("profilePage")
        .classList.add("hidden");


    document
        .getElementById("allTradesPage")
        .classList.add("hidden");


    document
        .getElementById("tradePage")
        .classList.add("hidden");


    document
        .getElementById("tradeDetails")
        .classList.add("hidden");


    document
        .getElementById("settingsPage")
        .classList.add("hidden");


    document
        .getElementById("homeNav")
        .classList.add("active");


    document
        .getElementById("profileNav")
        .classList.remove("active");


    document
        .getElementById("settingsNav")
        .classList.remove("active");


    renderCalendar();
}


function showProfile() {

    hidePortfolioPage();

    document
        .getElementById("homePage")
        .classList.add("hidden");


    document
        .getElementById("profilePage")
        .classList.remove("hidden");


    document
        .getElementById("allTradesPage")
        .classList.add("hidden");


    document
        .getElementById("tradePage")
        .classList.add("hidden");


    document
        .getElementById("tradeDetails")
        .classList.add("hidden");


    document
        .getElementById("settingsPage")
        .classList.add("hidden");


    document
        .getElementById("homeNav")
        .classList.remove("active");


    document
        .getElementById("profileNav")
        .classList.add("active");


    document
        .getElementById("settingsNav")
        .classList.remove("active");


    updateProfile();
}


function showSettings() {

    hidePortfolioPage();

    document
        .getElementById("homePage")
        .classList.add("hidden");


    document
        .getElementById("profilePage")
        .classList.add("hidden");


    document
        .getElementById("allTradesPage")
        .classList.add("hidden");


    document
        .getElementById("tradePage")
        .classList.add("hidden");


    document
        .getElementById("tradeDetails")
        .classList.add("hidden");


    document
        .getElementById("settingsPage")
        .classList.remove("hidden");


    document
        .getElementById("homeNav")
        .classList.remove("active");


    document
        .getElementById("profileNav")
        .classList.remove("active");


    document
        .getElementById("settingsNav")
        .classList.add("active");
}


// =========================================
// OPEN ALL TRADES
// =========================================

function openAllTrades() {

    hideSettingsPage();

    document
        .getElementById("homePage")
        .classList.add("hidden");


    document
        .getElementById("profilePage")
        .classList.add("hidden");


    document
        .getElementById("allTradesPage")
        .classList.remove("hidden");


    document
        .getElementById("tradePage")
        .classList.add("hidden");


    document
        .getElementById("tradeDetails")
        .classList.add("hidden");


    selectedPeriod = "today";


    updatePeriodButtons();

    renderAllTrades();
}


// =========================================
// CLOSE ALL TRADES
// =========================================

function closeAllTrades() {

    document
        .getElementById("allTradesPage")
        .classList.add("hidden");


    document
        .getElementById("profilePage")
        .classList.remove("hidden");


    updateProfile();
}


// =========================================
// TRADE FORM
// =========================================

function openTradeForm(dateString) {

    hidePortfolioPage();

    hideSettingsPage();

    document
        .getElementById("homePage")
        .classList.add("hidden");


    document
        .getElementById("profilePage")
        .classList.add("hidden");


    document
        .getElementById("allTradesPage")
        .classList.add("hidden");


    document
        .getElementById("tradeDetails")
        .classList.add("hidden");


    document
        .getElementById("tradePage")
        .classList.remove("hidden");


    formTradeDate =
        dateString ||
        getLocalDateString();


    document
        .getElementById("formTitle")
        .textContent =
        "Новая сделка · " +
        formatReadableDate(
            formTradeDate
        );


    clearForm();

    resetSaveButton();
}


function closeTradeForm() {

    document
        .getElementById("tradePage")
        .classList.add("hidden");


    document
        .getElementById("homePage")
        .classList.remove("hidden");


    document
        .getElementById("formTitle")
        .textContent = "Новая сделка";


    formTradeDate = null;

    clearForm();

    resetSaveButton();
}


// =========================================
// DIRECTION
// =========================================

function setDirection(value) {

    direction = value;


    document
        .getElementById("longButton")
        .classList.remove("active");


    document
        .getElementById("shortButton")
        .classList.remove("active");


    if (value === "LONG") {

        document
            .getElementById("longButton")
            .classList.add("active");

    } else {

        document
            .getElementById("shortButton")
            .classList.add("active");
    }
}


// =========================================
// SAVE TRADE
// =========================================

async function saveTrade() {

    const symbol =
        document
            .getElementById("symbol")
            .value
            .trim();


    const entry =
        document
            .getElementById("entry")
            .value;


    const exit =
        document
            .getElementById("exit")
            .value;


    const stopLoss =
        document
            .getElementById("stopLoss")
            .value;


    const takeProfit =
        document
            .getElementById("takeProfit")
            .value;


    const pnl =
        document
            .getElementById("pnl")
            .value;


    const comment =
        document
            .getElementById("comment")
            .value
            .trim();


    if (
        !symbol ||
        !entry ||
        !exit ||
        !pnl
    ) {

        alert(
            "Заполни обязательные поля."
        );

        return;
    }


    const {
        data: { user }
    } = await db.auth.getUser();


    if (!user) {

        alert(
            "Пользователь не найден."
        );

        return;
    }


    const trade = {

        user_id: user.id,

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
            comment,

        trade_date:
            formTradeDate ||
            getLocalDateString()
    };


    const {
        error
    } = await db
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

    resetSaveButton();

    formTradeDate = null;

    await loadTrades();


    document
        .getElementById("tradePage")
        .classList.add("hidden");


    document
        .getElementById("homePage")
        .classList.remove("hidden");


    alert(
        "Сделка сохранена!"
    );
}

// =========================================
// LOAD TRADES
// =========================================

async function loadTrades() {

    try {

    const {
        data: { user }
    } = await db.auth.getUser();


    if (!user) return;


    let data = [];
    let error = null;
    const PAGE = 1000;

    for (let from = 0; ; from += PAGE) {
        const res = await db
            .from("trades")
            .select("*")
            .eq("user_id", user.id)
            .order("trade_date", { ascending: false })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, from + PAGE - 1);

        if (res.error) { error = res.error; break; }
        data = data.concat(res.data || []);
        if (!res.data || res.data.length < PAGE) break;
    }


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


    if (
        !document
            .getElementById("allTradesPage")
            .classList.contains("hidden")
    ) {

        renderAllTrades();
    }


    if (
        selectedCalendarDate &&
        !document
            .getElementById("dayTrades")
            .classList.contains("hidden")
    ) {

        showDayTrades(
            selectedCalendarDate
        );
    }

    } catch (err) {
        console.error(
            "Ошибка loadTrades:",
            err
        );
    }

}


// =========================================
// CLEAR FORM
// =========================================

function clearForm() {

    document
        .getElementById("symbol")
        .value = "";


    document
        .getElementById("entry")
        .value = "";


    document
        .getElementById("exit")
        .value = "";


    document
        .getElementById("stopLoss")
        .value = "";


    document
        .getElementById("takeProfit")
        .value = "";


    document
        .getElementById("pnl")
        .value = "";


    document
        .getElementById("comment")
        .value = "";


    setDirection("LONG");
}


// =========================================
// CALENDAR
// =========================================

function renderCalendar() {

    try {

    const calendar =
        document.getElementById(
            "calendar"
        );


    const monthTitle =
        document.getElementById(
            "calendarMonth"
        );


    if (
        !calendar ||
        !monthTitle
    ) {
        return;
    }


    calendar.innerHTML = "";


    const year =
        currentCalendarDate
            .getFullYear();


    const month =
        currentCalendarDate
            .getMonth();


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
        monthNames[month] +
        " " +
        year;


    let firstDay =
        new Date(
            year,
            month,
            1
        ).getDay();


    if (firstDay === 0) {
        firstDay = 7;
    }


    const daysInMonth =
        new Date(
            year,
            month + 1,
            0
        ).getDate();


    // EMPTY DAYS

    for (
        let i = 1;
        i < firstDay;
        i++
    ) {

        const empty =
            document.createElement(
                "div"
            );


        empty.className =
            "calendar-day empty-day";


        calendar.appendChild(
            empty
        );
    }


    // DAYS

    for (
        let day = 1;
        day <= daysInMonth;
        day++
    ) {

        const dateString =
            formatDate(
                year,
                month + 1,
                day
            );


        const dayTrades =
            trades.filter(
                trade =>
                    trade.trade_date ===
                    dateString
            );


        const totalPnl =
            dayTrades.reduce(
                (
                    sum,
                    trade
                ) =>
                    sum +
                    Number(trade.pnl),

                0
            );


        const dayElement =
            document.createElement(
                "div"
            );


        dayElement.className =
            "calendar-day";


        // TODAY

        const todayString =
            getLocalDateString();


        if (
            dateString ===
            todayString
        ) {

            dayElement.classList.add(
                "today"
            );
        }


        // PROFIT / LOSS

        if (
            dayTrades.length > 0
        ) {

            if (
                totalPnl > 0
            ) {

                dayElement.classList.add(
                    "profit"
                );

            } else if (
                totalPnl < 0
            ) {

                dayElement.classList.add(
                    "loss"
                );
            }
        }


        let pnlText = "";


        if (
            dayTrades.length > 0
        ) {

            pnlText = formatPnlCompact(totalPnl);
        }


        dayElement.innerHTML = `

            <div class="calendar-number">
                ${day}
            </div>

            <div class="calendar-pnl">
                ${pnlText}
            </div>

        `;


        dayElement.onclick =
            function () {

                showDayTrades(
                    dateString,
                    day
                );
            };


        calendar.appendChild(
            dayElement
        );
    }

    } catch (err) {
        console.error(
            "Ошибка renderCalendar:",
            err
        );
    }

}


// =========================================
// CHANGE MONTH
// =========================================

function changeMonth(step) {

    currentCalendarDate =
        new Date(
            currentCalendarDate
                .getFullYear(),

            currentCalendarDate
                .getMonth() + step,

            1
        );


    renderCalendar();


    document
        .getElementById("dayTrades")
        .classList.add("hidden");


    selectedCalendarDate = null;
}


// =========================================
// DATE FORMAT
// =========================================

function formatDate(
    year,
    month,
    day
) {

    return (
        year +
        "-" +
        String(month).padStart(
            2,
            "0"
        ) +
        "-" +
        String(day).padStart(
            2,
            "0"
        )
    );
}


// =========================================
// LOCAL TODAY
// =========================================

function getLocalDateString() {

    const date =
        new Date();


    return formatDate(

        date.getFullYear(),

        date.getMonth() + 1,

        date.getDate()
    );
}


// =========================================
// DAY TRADES
// =========================================

function showDayTrades(
    dateString,
    day
) {

    if (!dateString) {
        return;
    }

    selectedCalendarDate =
        dateString;


    if (day === undefined) {

        day =
            Number(
                dateString.split("-")[2]
            );
    }


    const container =
        document.getElementById(
            "dayTrades"
        );


    const title =
        document.getElementById(
            "selectedDayTitle"
        );


    const list =
        document.getElementById(
            "selectedDayList"
        );


    const dayTrades =
        trades.filter(
            trade =>
                trade.trade_date ===
                dateString
        );


    title.textContent =
        "Сделки · " +
        day;


    list.innerHTML = "";


    if (
        dayTrades.length === 0
    ) {

        list.innerHTML = `

            <div class="empty">
                Сделок в этот день нет
            </div>

        `;

    } else {

        dayTrades.forEach(
            trade => {

                list.appendChild(
                    createTradeCard(
                        trade
                    )
                );
            }
        );
    }


    container.classList.remove(
        "hidden"
    );
}


// =========================================
// ADD TRADE FOR SELECTED DAY
// =========================================

function addTradeForSelectedDay() {

    openTradeForm(
        selectedCalendarDate ||
        getLocalDateString()
    );
}


// =========================================
// TRADE CARD
// =========================================

function createTradeCard(trade) {

    // textContent вместо innerHTML: символ может прийти от брокера
    const item = document.createElement("div");
    item.className = "card";

    const date = document.createElement("span");
    date.textContent = formatReadableDate(trade.trade_date);

    const symbol = document.createElement("strong");
    symbol.textContent = trade.symbol;

    const info = document.createElement("div");
    info.append(document.createTextNode(trade.direction + " · "));

    const pnl = document.createElement("b");
    pnl.textContent = formatPnl(trade.pnl);
    info.append(pnl);

    item.append(date, symbol, info);

    item.onclick = function () {
        openTradeDetails(trade);
    };

    return item;
}

// =========================================
// PROFILE
// =========================================

function updateProfile() {

    const today =
        getLocalDateString();


    const todayPnl =
        trades
            .filter(
                trade =>
                    trade.trade_date ===
                    today
            )
            .reduce(
                (
                    sum,
                    trade
                ) =>
                    sum +
                    Number(trade.pnl),

                0
            );


    const totalPnl =
        trades.reduce(
            (
                sum,
                trade
            ) =>
                sum +
                Number(trade.pnl),

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
                wins /
                trades.length *
                100
            )

            : 0;


    const todayElement =
        document.getElementById(
            "profileTodayPnl"
        );


    const totalElement =
        document.getElementById(
            "profileTotalPnl"
        );


    const tradesElement =
        document.getElementById(
            "profileTrades"
        );


    const winsElement =
        document.getElementById(
            "profileWins"
        );


    const lossesElement =
        document.getElementById(
            "profileLosses"
        );


    const winRateElement =
        document.getElementById(
            "profileWinRate"
        );


    if (todayElement) {

        todayElement.textContent =
            formatPnl(todayPnl);
    }


    if (totalElement) {

        totalElement.textContent =
            formatPnl(totalPnl);
    }


    if (tradesElement) {

        tradesElement.textContent =
            trades.length;
    }


    if (winsElement) {

        winsElement.textContent =
            wins;
    }


    if (lossesElement) {

        lossesElement.textContent =
            losses;
    }


    if (winRateElement) {

        winRateElement.textContent =
            winRate + "%";
    }


    // UPDATE CURRENCY SELECT

    const currencySelect =
        document.getElementById(
            "currencySelect"
        );


    if (currencySelect) {

        currencySelect.value =
            currentCurrency;
    }


    // UPDATE EXCHANGE RATE INFO

    updateExchangeRateInfo();
}


// =========================================
// ALL TRADES PAGE
// =========================================

function setTradePeriod(
    period
) {

    selectedPeriod =
        period;


    updatePeriodButtons();

    renderAllTrades();
}


// =========================================
// PERIOD BUTTONS
// =========================================

function updatePeriodButtons() {

    document
        .querySelectorAll(
            ".period-button"
        )
        .forEach(
            button => {

                button.classList.remove(
                    "active"
                );


                if (
                    button.dataset.period ===
                    selectedPeriod
                ) {

                    button.classList.add(
                        "active"
                    );
                }
            }
        );
}


// =========================================
// FILTER TRADES BY PERIOD
// =========================================

function getFilteredTrades() {

    if (
        selectedPeriod ===
        "all"
    ) {

        return [
            ...trades
        ];
    }


    const today =
        new Date();


    today.setHours(
        0,
        0,
        0,
        0
    );


    const startDate =
        new Date(today);


    if (
        selectedPeriod ===
        "today"
    ) {

        // Сегодня

    } else if (
        selectedPeriod ===
        "week"
    ) {

        startDate.setDate(
            today.getDate() - 6
        );

    } else if (
        selectedPeriod ===
        "month"
    ) {

        startDate.setDate(
            today.getDate() - 29
        );
    }


    const startString =
        formatDate(

            startDate
                .getFullYear(),

            startDate
                .getMonth() + 1,

            startDate
                .getDate()
        );


    const todayString =
        getLocalDateString();


    return trades.filter(
        trade => {

            return (
                trade.trade_date >=
                startString &&

                trade.trade_date <=
                todayString
            );
        }
    );
}


// =========================================
// RENDER ALL TRADES
// =========================================

function renderAllTrades() {

    const list =
        document.getElementById(
            "allTradesList"
        );


    const periodPnl =
        document.getElementById(
            "periodPnl"
        );


    const periodTrades =
        document.getElementById(
            "periodTrades"
        );


    const periodWinRate =
        document.getElementById(
            "periodWinRate"
        );


    const periodTitle =
        document.getElementById(
            "periodTitle"
        );


    if (
        !list ||
        !periodPnl ||
        !periodTrades ||
        !periodWinRate ||
        !periodTitle
    ) {
        return;
    }


    const filteredTrades =
        getFilteredTrades();


    const totalPnl =
        filteredTrades.reduce(
            (
                sum,
                trade
            ) =>
                sum +
                Number(trade.pnl),

            0
        );


    const wins =
        filteredTrades.filter(
            trade =>
                Number(trade.pnl) > 0
        ).length;


    const winRate =
        filteredTrades.length > 0

            ? Math.round(
                wins /
                filteredTrades.length *
                100
            )

            : 0;


    periodPnl.textContent =
        formatPnl(totalPnl);


    periodTrades.textContent =
        filteredTrades.length;


    periodWinRate.textContent =
        winRate + "%";


    // PERIOD TITLE

    if (
        selectedPeriod ===
        "today"
    ) {

        periodTitle.textContent =
            "Профит сегодня";

    } else if (
        selectedPeriod ===
        "week"
    ) {

        periodTitle.textContent =
            "Профит за 7 дней";

    } else if (
        selectedPeriod ===
        "month"
    ) {

        periodTitle.textContent =
            "Профит за 30 дней";

    } else {

        periodTitle.textContent =
            "Профит за всё время";
    }


    // LIST

    list.innerHTML = "";


    if (
        filteredTrades.length ===
        0
    ) {

        list.innerHTML = `

            <div class="empty">
                Сделок за этот период нет
            </div>

        `;

        return;
    }


    filteredTrades.forEach(
        trade => {

            list.appendChild(
                createTradeCard(
                    trade
                )
            );
        }
    );
}


// Автообновление курса, только если он "протух"
// (не обновлялся более 6 часов или ещё ни разу не обновлялся)
const RATES_MAX_AGE_MS = 6 * 60 * 60 * 1000;

async function maybeAutoUpdateRates() {

    const isStale =
        !lastRatesUpdate ||
        (new Date() - lastRatesUpdate) > RATES_MAX_AGE_MS;


    if (!isStale) {
        return;
    }


    const success =
        await fetchExchangeRates();


    if (success) {

        updateExchangeRateInfo();

        updateProfile();

        renderCalendar();

        renderAllTrades();

    } else {

        updateExchangeRateInfo();
    }
}


async function fetchExchangeRates() {

    try {

        // Получаем курсы рубля к доллару и евро
        // (exchangerate.host теперь требует платный access_key,
        // поэтому используем бесплатный open.er-api.com без ключа)
        const response =
            await fetch(
                "https://open.er-api.com/v6/latest/RUB"
            );


        if (!response.ok) {

            console.error(
                "Ошибка API:",
                response.statusText
            );

            return false;
        }


        const data =
            await response.json();


        if (
            data.result !== "success" ||
            !data.rates
        ) {

            console.error(
                "Неправильный формат данных"
            );

            return false;
        }


        // Инвертируем курсы (если 1 RUB = 0.01 USD, то 1 USD = 100 RUB)
        exchangeRates.USD =
            1 / data.rates.USD;

        exchangeRates.EUR =
            1 / data.rates.EUR;


        // Сохраняем время обновления
        lastRatesUpdate =
            new Date();


        // Сохраняем в localStorage
        saveExchangeRates();

        localStorage.setItem(
            "lastRatesUpdate",
            lastRatesUpdate.toISOString()
        );


        console.log(
            "Курсы обновлены:",
            exchangeRates
        );


        return true;

    } catch (error) {

        console.error(
            "Ошибка при получении курсов:",
            error
        );

        return false;
    }
}

function convertCurrency(
    amountInRubles,
    toCurrency = currentCurrency
) {

    const rate =
        exchangeRates[toCurrency];


    if (!rate) {
        return amountInRubles;
    }


    return amountInRubles / rate;
}


// =========================================
// FORMAT PNL
// =========================================

function formatPnl(
    value
) {

    const numberInRubles =
        Number(value);

    const converted =
        convertCurrency(
            numberInRubles,
            currentCurrency
        );

    const symbol =
        currencyData[currentCurrency].symbol;


    if (
        numberInRubles > 0
    ) {

        return (
            "+" +
            formatNumber(converted) +
            " " +
            symbol
        );
    }


    return (
        formatNumber(converted) +
        " " +
        symbol
    );
}


// =========================================
// FORMAT NUMBER
// =========================================

function formatNumber(
    value
) {

    return Number(value)
        .toLocaleString(
            "ru-RU"
        );
}


// =========================================
// READABLE DATE
// =========================================

function formatReadableDate(
    dateString
) {

    if (
        !dateString ||
        typeof dateString !==
            "string" ||
        dateString.trim() === ""
    ) {
        return "—";
    }


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


// =========================================
// TRADE DETAILS
// =========================================

function openTradeDetails(
    trade
) {

    detailsReturnPage =
        document.getElementById("allTradesPage").classList.contains("hidden")
            ? "home" : "all";

    hideSettingsPage();

    selectedTrade =
        trade;


    document
        .getElementById("homePage")
        .classList.add("hidden");


    document
        .getElementById("profilePage")
        .classList.add("hidden");


    document
        .getElementById("allTradesPage")
        .classList.add("hidden");


    document
        .getElementById("tradePage")
        .classList.add("hidden");


    document
        .getElementById("tradeDetails")
        .classList.remove("hidden");


    document
        .getElementById(
            "detailsSymbol"
        )
        .textContent =
        trade.symbol;


    document
        .getElementById(
            "detailsDate"
        )
        .textContent =
        formatReadableDate(
            trade.trade_date
        );


    document
        .getElementById(
            "detailsDirection"
        )
        .textContent =
        trade.direction;


    document
        .getElementById(
            "detailsEntry"
        )
        .textContent =
        trade.entry ?? "—";


    document
        .getElementById(
            "detailsExit"
        )
        .textContent =
        trade.exit ?? "—";


    document
        .getElementById(
            "detailsStopLoss"
        )
        .textContent =
        trade.stop_loss ?? "—";


    document
        .getElementById(
            "detailsTakeProfit"
        )
        .textContent =
        trade.take_profit ?? "—";


    document
        .getElementById(
            "detailsPnl"
        )
        .textContent =
        formatPnl(
            trade.pnl
        );


    document
        .getElementById(
            "detailsComment"
        )
        .textContent =
        trade.comment ||
        "—";
}


// =========================================
// CLOSE TRADE DETAILS
// =========================================

function closeTradeDetails() {

    selectedTrade = null;

    document.getElementById("tradeDetails").classList.add("hidden");

    if (detailsReturnPage === "all") {

        document.getElementById("allTradesPage").classList.remove("hidden");

        renderAllTrades();

    } else {

        document.getElementById("homePage").classList.remove("hidden");

        renderCalendar();
    }
}


// =========================================
// EDIT TRADE
// =========================================

function editTrade() {

    if (!selectedTrade) {
        return;
    }


    document
        .getElementById("tradeDetails")
        .classList.add("hidden");


    document
        .getElementById("tradePage")
        .classList.remove("hidden");


    document
        .getElementById("formTitle")
        .textContent =
        "Изменить сделку";


    document
        .getElementById("symbol")
        .value =
        selectedTrade.symbol;


    document
        .getElementById("entry")
        .value =
        selectedTrade.entry;


    document
        .getElementById("exit")
        .value =
        selectedTrade.exit;


    document
        .getElementById("stopLoss")
        .value =
        selectedTrade.stop_loss ||
        "";


    document
        .getElementById("takeProfit")
        .value =
        selectedTrade.take_profit ||
        "";


    document
        .getElementById("pnl")
        .value =
        selectedTrade.pnl;


    document
        .getElementById("comment")
        .value =
        selectedTrade.comment ||
        "";


    setDirection(
        selectedTrade.direction
    );


    const saveButton =
        document.getElementById("saveTradeButton");


    saveButton.textContent =
        "Сохранить изменения";


    saveButton.onclick =
        updateTrade;
}


// =========================================
// UPDATE TRADE
// =========================================

async function updateTrade() {

    if (!selectedTrade) {
        return;
    }


    const symbol =
        document
            .getElementById("symbol")
            .value
            .trim();


    const entry =
        document
            .getElementById("entry")
            .value;


    const exit =
        document
            .getElementById("exit")
            .value;


    const stopLoss =
        document
            .getElementById("stopLoss")
            .value;


    const takeProfit =
        document
            .getElementById("takeProfit")
            .value;


    const pnl =
        document
            .getElementById("pnl")
            .value;


    const comment =
        document
            .getElementById("comment")
            .value
            .trim();


    if (
        !symbol ||
        !entry ||
        !exit ||
        !pnl
    ) {

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


    document
        .getElementById("tradePage")
        .classList.add("hidden");


    document
        .getElementById("homePage")
        .classList.remove("hidden");


    alert(
        "Сделка изменена!"
    );
}


// =========================================
// RESET SAVE BUTTON
// =========================================

function resetSaveButton() {

    const saveButton =
        document.getElementById("saveTradeButton");


    if (!saveButton) {
        return;
    }


    saveButton.textContent =
        "Сохранить сделку";


    saveButton.onclick =
        saveTrade;
}


// =========================================
// DELETE TRADE
// =========================================

async function deleteTrade() {

    if (!selectedTrade) {
        return;
    }


    const confirmed =
        confirm(
            "Удалить эту сделку?"
        );


    if (!confirmed) {
        return;
    }


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


    document
        .getElementById("tradeDetails")
        .classList.add("hidden");


    document
        .getElementById("homePage")
        .classList.remove("hidden");


    alert(
        "Сделка удалена!"
    );
}


// =========================================
// CURRENCY FUNCTIONS
// =========================================

function loadCurrency() {

    const saved =
        localStorage.getItem(
            "tradingCurrency"
        );


    if (saved && currencyData[saved]) {

        currentCurrency = saved;
    }


    const select =
        document.getElementById(
            "currencySelect"
        );


    if (select) {

        select.value = currentCurrency;
    }
}


function saveExchangeRates() {

    localStorage.setItem(
        "exchangeRates",
        JSON.stringify(exchangeRates)
    );
}


function loadExchangeRates() {

    const saved =
        localStorage.getItem(
            "exchangeRates"
        );


    if (saved) {

        try {

            const rates =
                JSON.parse(saved);

            Object.assign(
                exchangeRates,
                rates
            );

        } catch (e) {

            console.log(
                "Ошибка загрузки курсов"
            );
        }
    }


    const savedTime =
        localStorage.getItem(
            "lastRatesUpdate"
        );


    if (savedTime) {

        lastRatesUpdate =
            new Date(savedTime);
    }
}


function setCurrency(code) {

    if (!currencyData[code]) {
        return;
    }


    currentCurrency = code;


    localStorage.setItem(
        "tradingCurrency",
        code
    );


    updateProfile();

    renderCalendar();

    renderAllTrades();
}


function handleCurrencyChange() {

    const select =
        document.getElementById(
            "currencySelect"
        );


    if (select) {

        setCurrency(select.value);
    }
}


function setExchangeRate(
    currency,
    rate
) {

    if (!currencyData[currency]) {
        return;
    }


    exchangeRates[currency] = rate;

    saveExchangeRates();

    updateExchangeRateInfo();

    updateProfile();

    renderCalendar();

    renderAllTrades();
}


async function updateRatesFromAPI() {

    const btn =
        document.getElementById(
            "updateRatesBtn"
        );


    if (btn) {

        btn.disabled = true;

        btn.textContent =
            "Загрузка...";
    }


    const success =
        await fetchExchangeRates();


    if (success) {

        updateExchangeRateInfo();

        updateProfile();

        renderCalendar();

        renderAllTrades();


        if (btn) {

            btn.textContent =
                "✓ Обновлено!";

            setTimeout(() => {

                btn.textContent =
                    "Обновить курс";

                btn.disabled = false;

            }, 2000);
        }

    } else {

        if (btn) {

            btn.textContent =
                "✗ Ошибка";

            setTimeout(() => {

                btn.textContent =
                    "Обновить курс";

                btn.disabled = false;

            }, 2000);
        }
    }
}


function updateExchangeRateInfo() {

    const rateInfo =
        document.getElementById(
            "exchangeRateInfo"
        );


    if (!rateInfo) {
        return;
    }


    const usdRate =
        Math.round(
            exchangeRates.USD * 100
        ) / 100;

    const eurRate =
        Math.round(
            exchangeRates.EUR * 100
        ) / 100;


    let timeText = "Никогда";


    if (lastRatesUpdate) {

        const now =
            new Date();

        const diff =
            now - lastRatesUpdate;

        const minutes =
            Math.floor(
                diff / 60000
            );

        const hours =
            Math.floor(
                diff / 3600000
            );

        const days =
            Math.floor(
                diff / 86400000
            );


        if (minutes < 1) {

            timeText = "Только что";

        } else if (minutes < 60) {

            timeText =
                minutes + " мин. назад";

        } else if (hours < 24) {

            timeText =
                hours + " ч. назад";

        } else {

            timeText =
                days + " дн. назад";
        }
    }


    rateInfo.innerHTML = `
        <div>Курс: 1 $ = ${usdRate} ₽ | 1 € = ${eurRate} ₽</div>
        <div style="margin-top: 6px; color: #3a3d43; font-size: 9px;">
            Обновлено: ${timeText}
        </div>
    `;
}


// =========================================
// T-INVEST (Т-ИНВЕСТИЦИИ) SYNC
// =========================================
// Токен НИКОГДА не хранится и не расшифровывается в браузере.
// Эти функции только пересылают его один раз в Edge Function
// (по HTTPS, с проверкой сессии пользователя), которая шифрует
// его и сохраняет. Дальше синхронизация тоже целиком идёт на
// сервере — браузер только просит "синхронизируй" и получает
// в ответ количество импортированных сделок.

function functionsUrl(name) {

    return SUPABASE_URL +
        "/functions/v1/" +
        name;
}


async function connectTinkoff() {

    const tokenInput =
        document.getElementById(
            "tinkoffTokenInput"
        );

    const token =
        tokenInput.value.trim();


    if (!token) {

        showAuthStatus(
            "tinkoffStatus",
            "Введите токен",
            true
        );

        return;
    }


    const {
        data: { session }
    } = await db.auth.getSession();


    if (!session) {

        showAuthStatus(
            "tinkoffStatus",
            "Нет активной сессии",
            true
        );

        return;
    }


    const btn =
        document.getElementById(
            "connectTinkoffBtn"
        );

    btn.disabled = true;

    btn.textContent =
        "Сохраняем...";


    try {

        const res =
            await fetch(
                functionsUrl(
                    "save-broker-token"
                ),
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                        Authorization:
                            "Bearer " +
                            session.access_token
                    },
                    body: JSON.stringify({
                        token
                    })
                }
            );

        const result =
            await res.json();


        if (!res.ok) {

            showAuthStatus(
                "tinkoffStatus",
                result.error ||
                    "Ошибка сохранения токена",
                true
            );

            return;
        }


        tokenInput.value = "";

        refreshApiBanner();

        showAuthStatus(
            "tinkoffStatus",
            "Токен сохранён. Теперь можно синхронизировать сделки."
        );

    } catch (e) {

        console.error(
            "connectTinkoff error:",
            e
        );

        showAuthStatus(
            "tinkoffStatus",
            "Ошибка сети",
            true
        );

    } finally {

        btn.disabled = false;

        btn.textContent =
            "Подключить";
    }
}


async function syncTinkoffTrades() {

    const {
        data: { session }
    } = await db.auth.getSession();


    if (!session) {

        showAuthStatus(
            "tinkoffStatus",
            "Нет активной сессии",
            true
        );

        return;
    }


    const btn =
        document.getElementById(
            "syncTinkoffBtn"
        );

    btn.disabled = true;

    btn.textContent =
        "Синхронизация...";


    try {

        const res =
            await fetch(
                functionsUrl(
                    "sync-tinkoff-trades"
                ),
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                        Authorization:
                            "Bearer " +
                            session.access_token
                    },
                    body: JSON.stringify({ full: true })
                }
            );

        const result =
            await res.json();


        if (!res.ok) {

            showAuthStatus(
                "tinkoffStatus",
                result.error ||
                    "Ошибка синхронизации",
                true
            );

            return;
        }


        showAuthStatus(
            "tinkoffStatus",
            "Импортировано сделок: " +
                result.imported
        );


        await loadTrades();

        renderCalendar();

        updateProfile();

    } catch (e) {

        console.error(
            "syncTinkoffTrades error:",
            e
        );

        showAuthStatus(
            "tinkoffStatus",
            "Ошибка сети",
            true
        );

    } finally {

        btn.disabled = false;

        btn.textContent =
            "Синхронизировать сейчас";
    }
}


// =========================================
// RULES TOGGLE
// =========================================

function toggleRules() {

    const content =
        document.getElementById(
            "rulesContent"
        );

    const header =
        document.querySelector(
            ".rules-header"
        );

    if (!content) return;

    content.classList.toggle(
        "hidden"
    );

    header.classList.toggle(
        "active"
    );
}


// =========================================
// DELETE SYNCED TRADES
// =========================================

function openDeleteSyncedConfirm() {

    const modal =
        document.getElementById(
            "deleteConfirmModal"
        );

    if (modal) {
        modal.classList.remove("hidden");
    }
}


function closeDeleteSyncedConfirm() {

    const modal =
        document.getElementById(
            "deleteConfirmModal"
        );

    if (modal) {
        modal.classList.add("hidden");
    }
}


async function confirmDeleteSyncedTrades() {

    closeDeleteSyncedConfirm();

    try {

        if (!db) return;

        const { data: { user } } =
            await db
                .auth
                .getUser();

        if (!user) return;


        const { error } =
            await db
                .from("trades")
                .delete()
                .eq("user_id", user.id)
                .eq("source", "tinkoff");


        if (error) {
            console.error(
                "Ошибка удаления:",
                error
            );
            alert(
                "Ошибка при удалении сделок"
            );
            return;
        }

        // Запоминаем момент удаления на сервере, чтобы автосинхронизация
        // не возвращала старые сделки при следующем входе
        const { error: markError } =
            await db.rpc(
                "mark_synced_trades_deleted"
            );

        if (markError) {
            console.error(
                "Ошибка записи sync_from:",
                markError
            );
        }

        alert(
            "✅ Синхронизированные сделки удалены"
        );

        loadTrades();

        renderCalendar();

        updateProfile();

    } catch (err) {

        console.error(err);

        alert(
            "Ошибка: " + err.message
        );

    }

}


// =========================================
// THEME MANAGEMENT
// =========================================

let currentTheme = "dark";


function initTheme() {

    const saved =
        localStorage.getItem(
            "appTheme"
        );

    if (saved === "light") {

        currentTheme = "light";

        document
            .documentElement
            .classList.add(
                "light-theme"
            );

    } else {

        currentTheme = "dark";

        document
            .documentElement
            .classList.remove(
                "light-theme"
            );
    }

    updateThemeUI();
}


function toggleTheme() {

    if (currentTheme === "dark") {

        currentTheme = "light";

        document
            .documentElement
            .classList.add(
                "light-theme"
            );

    } else {

        currentTheme = "dark";

        document
            .documentElement
            .classList.remove(
                "light-theme"
            );
    }

    localStorage.setItem(
        "appTheme",
        currentTheme
    );

    updateThemeUI();
}


function updateThemeUI() {

    const toggle =
        document.getElementById(
            "themeToggle"
        );

    const label =
        document.getElementById(
            "themeLabel"
        );


    if (!toggle || !label) {
        return;
    }


    if (currentTheme === "light") {

        toggle.classList.add(
            "active"
        );

        label.textContent =
            "Светлая";

    } else {

        toggle.classList.remove(
            "active"
        );

        label.textContent =
            "Тёмная";
    }
}


// =========================================
// START
// =========================================

// Приложение стартует само: подписка onAuthStateChange выше
// получает начальное состояние сессии сразу при регистрации
// и вызывает startApp() или показывает экран входа.

// =========================================
// HELPERS (v2)
// =========================================

function hideSettingsPage() {

    document.getElementById("settingsPage").classList.add("hidden");

    document.getElementById("settingsNav").classList.remove("active");
}

function formatPnlCompact(value) {

    const rub = Number(value);

    const c = convertCurrency(rub, currentCurrency);

    const symbol = currencyData[currentCurrency].symbol;

    const abs = Math.abs(c);

    const fmt = (n, d) =>
        n.toLocaleString("ru-RU", { maximumFractionDigits: d });

    let text;

    if (abs >= 1e6) text = fmt(c / 1e6, 1) + "M";
    else if (abs >= 1e4) text = fmt(c / 1e3, 1) + "k";
    else text = fmt(c, 2);

    return (rub > 0 ? "+" : "") + text + " " + symbol;
}

// Баннер «Подключите API»: статус берём из RPC broker_status
// (сам токен клиенту по-прежнему недоступен).
async function refreshApiBanner() {

    try {

        const { data, error } = await db.rpc("broker_status");

        if (error) return;

        const banner = document.getElementById("apiBanner");

        if (banner) {
            banner.classList.toggle("hidden", Array.isArray(data) && data.length > 0);
        }

    } catch (e) {
        console.log("refreshApiBanner:", e);
    }
}

function openApiSetup() {

    showSettings();

    setTimeout(() => {

        const input = document.getElementById("tinkoffTokenInput");

        if (input) {
            input.scrollIntoView({ block: "center" });
            input.focus({ preventScroll: true });
        }

    }, 60);
}

// =========================================
// ПОРТФЕЛЬ (T-Invest)
// =========================================
// Данные приходят из Edge Function get-tinkoff-portfolio:
// токен брокера в браузер не попадает.

let portfolioData = null;
let portfolioLoading = false;
let portfolioLoadedAt = 0;
const PORTFOLIO_MAX_AGE_MS = 30 * 1000;

const PF_GROUPS = [
    { key: "share",    label: "Акции",     color: "var(--accent)", total: "shares" },
    { key: "bond",     label: "Облигации", color: "#7dd3fc",       total: "bonds" },
    { key: "etf",      label: "Фонды",     color: "#fcd34d",       total: "etf" },
    { key: "futures",  label: "Фьючерсы",  color: "#fb923c",       total: "futures" },
    { key: "currency", label: "Валюта",    color: "#94a3b8",       total: "currencies" },
    { key: "other",    label: "Прочее",    color: "#64748b",       total: "other" }
];

const PF_SYMBOLS = { RUB: "₽", USD: "$", EUR: "€", CNY: "¥", HKD: "HK$", GBP: "£", CHF: "₣" };

function hidePortfolioPage() {
    const page = document.getElementById("portfolioPage");
    if (page) page.classList.add("hidden");
    const an = document.getElementById("analysisPage");
    if (an) an.classList.add("hidden");
    const anNav = document.getElementById("analysisNav");
    if (anNav) anNav.classList.remove("active");
    const nav = document.getElementById("portfolioNav");
    if (nav) nav.classList.remove("active");
}

function showPortfolio() {
    ["homePage", "profilePage", "allTradesPage", "tradePage", "tradeDetails", "settingsPage", "analysisPage"]
        .forEach(id => document.getElementById(id).classList.add("hidden"));
    document.getElementById("analysisNav").classList.remove("active");
    ["homeNav", "profileNav", "settingsNav"]
        .forEach(id => document.getElementById(id).classList.remove("active"));

    document.getElementById("portfolioPage").classList.remove("hidden");
    document.getElementById("portfolioNav").classList.add("active");

    if (portfolioData) renderPortfolio();

    if (!portfolioData || Date.now() - portfolioLoadedAt > PORTFOLIO_MAX_AGE_MS) {
        loadPortfolio();
    }
}

function pfEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
}

function pfNum(n, digits) {
    return Number(n).toLocaleString("ru-RU", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

// Сумма в рублях -> в выбранную в приложении валюту
function pfRub(rub, signed) {
    const c = convertCurrency(Number(rub), currentCurrency);
    const sym = currencyData[currentCurrency].symbol;
    const text = pfNum(c, Math.abs(c) >= 1000 ? 0 : 2);
    return (signed && c > 0 ? "+" : "") + text + " " + sym;
}

function pfPct(v, signed) {
    return (signed && v > 0 ? "+" : "") + pfNum(v, 2) + "%";
}

function pfSignClass(v) {
    return v > 0 ? "pf-up" : v < 0 ? "pf-down" : "";
}

// Сумма в валюте инструмента -> рубли по курсам приложения (или null)
function pfToRub(amount, cur) {
    if (cur === "RUB") return amount;
    const rate = exchangeRates[cur];
    return rate ? amount * rate : null;
}

// Сумма позиции: в валюте приложения, а если курса нет — в своей валюте
function pfMoney(amount, cur, signed) {
    const rub = pfToRub(amount, cur);
    if (rub !== null) return pfRub(rub, signed);
    return (signed && amount > 0 ? "+" : "") + pfNum(amount, 2) + " " + (PF_SYMBOLS[cur] || cur);
}

function pfNative(amount, cur) {
    return pfNum(amount, Math.abs(amount) >= 1000 ? 0 : 2) + " " + (PF_SYMBOLS[cur] || cur);
}

function pfQty(q) {
    return Number(q).toLocaleString("ru-RU", { maximumFractionDigits: 4 });
}

function pfShowStatus(message, isError) {
    showAuthStatus("pfStatus", message, isError);
}

function pfHideStatus() {
    document.getElementById("pfStatus").classList.add("hidden");
}

async function loadPortfolio() {
    if (portfolioLoading) return;
    portfolioLoading = true;

    const btn = document.getElementById("pfRefresh");
    btn.disabled = true;
    btn.classList.add("spinning");
    pfHideStatus();

    try {
        const { data: { session } } = await db.auth.getSession();

        if (!session) {
            pfShowStatus("Нет активной сессии", true);
            return;
        }

        const res = await fetch(functionsUrl("get-tinkoff-portfolio"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + session.access_token
            },
            body: JSON.stringify({})
        });

        let result = {};
        try { result = await res.json(); } catch (e) { /* не JSON */ }

        if (!res.ok) {
            if (result.code === "no_token") {
                portfolioData = null;
                document.getElementById("pfContent").classList.add("hidden");
                document.getElementById("pfNoToken").classList.remove("hidden");
                document.getElementById("pfTotal").textContent = "—";
                document.getElementById("pfDaily").textContent = "—";
                return;
            }
            // старые данные (если есть) остаются на экране
            pfShowStatus(result.error || "Не удалось загрузить портфель", true);
            return;
        }

        portfolioData = result;
        portfolioLoadedAt = Date.now();
        renderPortfolio();
        if (typeof anOnPortfolio === "function") anOnPortfolio();

    } catch (e) {
        console.error("loadPortfolio error:", e);
        pfShowStatus("Ошибка сети. Проверьте подключение и обновите.", true);
    } finally {
        portfolioLoading = false;
        btn.disabled = false;
        btn.classList.remove("spinning");
    }
}

function renderPortfolio() {
    const d = portfolioData;
    if (!d) return;

    document.getElementById("pfNoToken").classList.add("hidden");
    document.getElementById("pfContent").classList.remove("hidden");

    // --- шапка: стоимость и изменение за день ---
    document.getElementById("pfTotal").textContent = pfRub(d.totals.portfolio);

    const dailyEl = document.getElementById("pfDaily");
    if (d.daily && d.daily.amount !== null) {
        const pct = d.daily.pct !== null ? " · " + pfPct(d.daily.pct, true) : "";
        dailyEl.textContent = pfRub(d.daily.amount, true) + pct;
        dailyEl.className = pfSignClass(d.daily.amount);
    } else {
        dailyEl.textContent = "—";
        dailyEl.className = "";
    }

    renderPortfolioStructure(d);
    renderPortfolioCash(d);
    renderPortfolioPositions(d);

    const t = new Date(d.updatedAt);
    document.getElementById("pfUpdated").textContent =
        "Обновлено в " + t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function renderPortfolioStructure(d) {
    const total = d.totals.portfolio;
    const bar = document.getElementById("pfBar");
    const legend = document.getElementById("pfLegend");

    // «Прочее» (опционы, структурные ноты) показываем, только если оно есть
    const groups = PF_GROUPS.filter(g => g.key !== "other" || d.totals.other !== 0);

    bar.innerHTML = groups.map(g => {
        const v = Math.max(0, d.totals[g.total]);
        const w = total > 0 ? (v / total) * 100 : 0;
        return w > 0 ? `<span style="width:${w.toFixed(2)}%;background:${g.color}"></span>` : "";
    }).join("");

    legend.innerHTML = groups.map(g => {
        const v = d.totals[g.total];
        const pct = total > 0 ? (v / total) * 100 : 0;
        return `<div class="pf-legend-row${v === 0 ? " zero" : ""}">
            <i class="pf-dot" style="background:${g.color}"></i>
            <span>${g.label}</span>
            <span class="pf-sum">${pfRub(v)}</span>
            <span class="pf-pct">${pfNum(pct, 1)}%</span>
        </div>`;
    }).join("");
}

function renderPortfolioCash(d) {
    const el = document.getElementById("pfCash");

    if (!d.cash.length) {
        el.innerHTML = `<div class="pf-empty">Свободных денег нет</div>`;
        return;
    }

    el.innerHTML = d.cash.map(c => `
        <div class="pf-cash-row">
            <span>${pfEsc(c.currency)}</span>
            <b>${pfNative(c.available, c.currency)}${c.blocked ? `<small>в заявках ${pfNative(c.blocked, c.currency)}</small>` : ""}</b>
        </div>`).join("");
}

function renderPortfolioPositions(d) {
    const el = document.getElementById("pfPositions");

    if (!d.positions.length) {
        el.innerHTML = `<div class="pf-card"><div class="pf-empty">Открытых позиций нет</div></div>`;
        return;
    }

    const keyOf = p => PF_GROUPS.some(g => g.key === p.type) ? p.type : "other";
    // размер позиции в рублях — для сортировки внутри группы
    const sizeOf = p => {
        const base = p.type === "futures" ? p.varMargin : p.value;
        const rub = pfToRub(Math.abs(base || 0), p.currency);
        return rub === null ? 0 : rub;
    };

    let html = "";

    PF_GROUPS.forEach(g => {
        const items = d.positions.filter(p => keyOf(p) === g.key).sort((a, b) => sizeOf(b) - sizeOf(a));
        if (!items.length) return;

        let right;
        if (g.key === "futures") {
            const margin = items.reduce((s, p) => s + (pfToRub(p.varMargin || 0, p.currency) || 0), 0);
            right = "вар. маржа " + pfRub(margin, true);
        } else {
            right = pfRub(d.totals[g.total]);
        }

        html += `<div class="pf-group"><h3>${g.label}</h3><span>${right}</span></div>`;
        html += items.map(renderPositionCard).join("");
    });

    el.innerHTML = html;
}

function renderPositionCard(p) {
    const isFutures = p.type === "futures";
    const short = p.quantity < 0;

    // у фьючерсов цена в пунктах — без значка валюты
    const price = v => isFutures ? pfNum(v, 2) : pfNative(v, p.currency);

    const pnlText = pfMoney(p.pnl, p.currency, true);
    const pctText = p.pnlPct !== null ? pfPct(p.pnlPct, true) : "";
    const cls = pfSignClass(p.pnl);

    const stats = [
        ["Количество", pfQty(p.quantity)],
        ["Средняя", price(p.avgPrice)],
        ["Текущая", price(p.currentPrice)]
    ];
    if (!isFutures && p.value !== null) {
        stats.push(["Стоимость", pfMoney(p.value, p.currency, false)]);
    }

    const margin = isFutures ? `
        <div class="pf-margin">
            <span>Вариационная маржа</span>
            <b class="${pfSignClass(p.varMargin)}">${pfMoney(p.varMargin || 0, p.currency, true)}</b>
        </div>` : "";

    return `<div class="pf-position">
        <div class="pf-pos-head">
            <div class="pf-pos-id">
                <strong>${pfEsc(p.ticker)}${short ? '<i class="pf-tag">шорт</i>' : ""}</strong>
                <span>${pfEsc(p.name)}</span>
            </div>
            <div class="pf-pos-pnl ${cls}">
                <b>${pnlText}</b>
                <span>${pctText}</span>
            </div>
        </div>
        <div class="pf-stats">
            ${stats.map(s => `<div><span>${s[0]}</span><b>${s[1]}</b></div>`).join("")}
        </div>${margin}
    </div>`;
}

// =========================================
// АНАЛИЗ СДЕЛКИ: чек-лист стратегии + калькулятор по фьючерсам
// Стратегия: объём + уровни + подтверждение.
// =========================================

const AN_CHECKS = {
    ctx: [
        ["levels", "Ключевые уровни нанесены (экстремумы, зоны S/R)"],
        ["poc", "Профиль объёма растянут, POC найден"]
    ],
    zone: [
        ["z_poc", "POC"],
        ["z_va", "VAH / VAL"],
        ["z_node", "Узел повышенного объёма"],
        ["z_bars", "Отбойные бары на уровне"],
        ["z_fib", "Фибоначчи 0.5 / 0.618 / 0.786"]
    ],
    conf: [
        ["c_bar", "Отбойный бар или паттерн разворота"],
        ["c_vol", "Всплеск объёма на реакции"]
    ]
};
const AN_ZONE_KEYS = ["z_poc", "z_va", "z_node", "z_bars", "z_fib"];
const AN_ZONE_NAMES = ["нет", "слабая", "нормальная", "сильная"];

const anState = { dir: "long", trend: "", phase: "", reason: "", checks: {} };
const anTouched = { portfolio: false, free: false };
let anInited = false;
let anContracts = [];
let anAnalysis = null;      // последний автоанализ по свечам
let anCurrentUid = null;    // контракт, который отслеживаем
let anLoadedAt = 0;
let anTimer = null;
let anRestored = false;
const anManual = new Set(); // то, что пользователь поменял сам: авто это не трогает

const AN_TREND = { up: "вверх", down: "вниз", flat: "флэт" };
const AN_PHASE = { impulse: "импульс", pullback: "коррекция", range: "флэт" };

function anInit() {
    if (anInited) return;
    anInited = true;

    anBuildSeg("anSegDir", "dir", [["long", "Лонг"], ["short", "Шорт"]]);
    anBuildSeg("anSegTrend", "trend", [["up", "Вверх"], ["down", "Вниз"], ["flat", "Флэт"]]);
    anBuildSeg("anSegPhase", "phase", [["impulse", "Импульс"], ["pullback", "Коррекция"], ["range", "Флэт"]]);

    anBuildChecks("anCtxChecks", AN_CHECKS.ctx);
    anBuildChecks("anZoneChecks", AN_CHECKS.zone);
    anBuildChecks("anConfChecks", AN_CHECKS.conf);

    // сохранённые настройки: доля портфеля и порог потери
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem("anSettings") || "{}"); } catch (e) { /* пусто */ }
    document.getElementById("anShare").value = saved.share || 10;
    document.getElementById("anRiskLimit").value = saved.limit || 3;

    const page = document.getElementById("analysisPage");
    page.addEventListener("input", anOnInput);
    page.addEventListener("click", anOnClick);
    document.getElementById("anTicker").addEventListener("keydown", e => {
        if (e.key === "Enter") anFind();
    });

    anSyncSegs();
}

function anBuildSeg(id, key, options) {
    document.getElementById(id).innerHTML = options.map(o =>
        `<button type="button" data-key="${key}" data-v="${o[0]}">${o[1]}</button>`).join("");
}

function anBuildChecks(id, list) {
    document.getElementById(id).innerHTML = list.map(c =>
        `<label class="an-check"><input type="checkbox" data-k="${c[0]}"><span class="an-box"></span><span>${c[1]}</span></label>`).join("");
}

function anSyncSegs() {
    document.querySelectorAll("#analysisPage .an-seg button").forEach(b => {
        b.classList.toggle("active", anState[b.dataset.key] === b.dataset.v);
    });
}


function anOnClick(e) {
    const b = e.target.closest(".an-seg button");
    if (!b) return;
    const key = b.dataset.key, v = b.dataset.v;
    // направление переключается всегда, остальное можно снять повторным нажатием
    anState[key] = key === "dir" ? v : (anState[key] === v ? "" : v);
    if (key !== "dir") anManual.add(key);
    anSyncSegs();
    // при смене направления автоанализ подставляет другую зону и план
    if (key === "dir") anApplyAnalysis(); else anUpdate();
}


function anOnInput(e) {
    const t = e.target;
    if (t.dataset && t.dataset.k) {
        anState.checks[t.dataset.k] = t.checked;
        anManual.add(t.dataset.k);
    }
    if (t.id === "anReason") anState.reason = t.value;
    if (t.id === "anEntry") anManual.add("entry");
    if (t.id === "anStop") anManual.add("stop");
    if (t.id === "anTake") anManual.add("take");
    if (t.id === "anPortfolio") anTouched.portfolio = true;
    if (t.id === "anFree") anTouched.free = true;
    if (t.id === "anShare" || t.id === "anRiskLimit") {
        try {
            localStorage.setItem("anSettings", JSON.stringify({
                share: anNum("anShare") || 10,
                limit: anNum("anRiskLimit") || 3
            }));
        } catch (err) { /* не критично */ }
    }
    anUpdate();
}


function showAnalysis() {
    anInit();

    ["homePage", "profilePage", "allTradesPage", "tradePage", "tradeDetails", "settingsPage", "portfolioPage"]
        .forEach(id => document.getElementById(id).classList.add("hidden"));
    ["homeNav", "profileNav", "settingsNav", "portfolioNav"]
        .forEach(id => document.getElementById(id).classList.remove("active"));

    document.getElementById("analysisPage").classList.remove("hidden");
    document.getElementById("analysisNav").classList.add("active");

    if (portfolioData) anOnPortfolio();
    else if (!portfolioLoading) loadPortfolio();

    // при первом открытии возвращаем последний тикер и сразу всё считаем
    if (!anRestored) {
        anRestored = true;
        let saved = "";
        try { saved = localStorage.getItem("anLastTicker") || ""; } catch (e) { /* пусто */ }
        if (saved) {
            document.getElementById("anTicker").value = saved;
            anFind();
        }
    } else if (anCurrentUid && Date.now() - anLoadedAt > 60000) {
        anLoadContract(anCurrentUid, true);
    }

    anUpdate();
    if (anChartTicker) anRenderChart();
    window.scrollTo(0, 0);
}

// подставляем портфель и свободные рубли, пока пользователь не ввёл свои
function anOnPortfolio() {
    if (!portfolioData || !anInited) return;

    const p = document.getElementById("anPortfolio");
    const f = document.getElementById("anFree");

    if (!anTouched.portfolio) p.value = Math.round(portfolioData.totals.portfolio);
    if (!anTouched.free) {
        const rub = portfolioData.cash.find(c => c.currency === "RUB");
        f.value = rub ? Math.round(rub.available) : "";
    }
    anUpdate();
}

// ---------- числа и формат ----------

function anNum(id) {
    const v = parseFloat(String(document.getElementById(id).value).replace(/\s/g, "").replace(",", "."));
    return isFinite(v) ? v : NaN;
}

function anRub(n, signed) {
    return (signed && n > 0 ? "+" : "") + pfNum(n, Math.abs(n) >= 1000 ? 0 : 2) + " ₽";
}

function anPx(n) {
    return Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function anEsc(s) { return pfEsc(s); }

// ---------- вердикт по стратегии ----------

// Оценка 0–100: контекст 30 + зона 30 + подтверждение 20 + риск 20
function anScoreParts(ev, calc) {
    const c = anState.checks;

    let ctx = 0;
    if (anState.trend) {
        if (ev.counter) ctx += anState.reason.trim() ? 4 : 0;
        else if (anState.trend === "flat") ctx += 8;
        else ctx += 14;
    }
    ctx += ({ pullback: 8, range: anState.trend === "flat" ? 6 : 3, impulse: 2 })[anState.phase] || 0;
    if (c.levels) ctx += 4;
    if (c.poc) ctx += 4;

    const plan = anAnalysis && anAnalysis.plans ? anAnalysis.plans[anState.dir] : null;
    const zone = Math.min(ev.zoneCount, 5) * 5 + (plan && plan.inZone ? 5 : 0);

    const conf = (c.c_bar ? 10 : 0) + (c.c_vol ? 10 : 0);

    let risk = 0;
    if (calc.state === "ok") {
        risk += calc.rr >= 2 ? 10 : calc.rr >= 1.5 ? 7 : calc.rr >= 1 ? 4 : 0;
        risk += (!(calc.limit > 0) || calc.lossPct <= calc.limit) ? 6 : 0;
        risk += calc.loss <= calc.cushion ? 4 : calc.loss <= calc.buffer ? 2 : 0;
    }

    return [
        { k: "Контекст", v: ctx, max: 30 },
        { k: "Зона", v: zone, max: 30 },
        { k: "Подтверждение", v: conf, max: 20 },
        { k: "Риск", v: risk, max: 20 }
    ];
}

function anEvaluate() {
    const c = anState.checks;
    const issues = [];

    const missing = [];
    if (!anState.trend) missing.push("тренд");
    if (!anState.phase) missing.push("фаза");
    if (!c.levels) missing.push("ключевые уровни");
    if (!c.poc) missing.push("POC");
    if (missing.length) issues.push({ level: "warn", text: "Контекст D/W: не отмечено — " + missing.join(", ") });

    const zoneCount = AN_ZONE_KEYS.filter(k => c[k]).length;
    if (zoneCount === 0) issues.push({ level: "bad", text: "Нет зоны входа: отметьте факторы, которые совпали на 4H" });
    else if (zoneCount === 1) issues.push({ level: "warn", text: "Зона слабая: совпал только один фактор" });

    if (!c.c_bar) issues.push({ level: "bad", text: "Нет подтверждения: отбойного бара или паттерна разворота" });
    if (!c.c_vol) issues.push({ level: "bad", text: "Нет подтверждения: всплеска объёма на реакции" });

    const counter = (anState.dir === "long" && anState.trend === "down") ||
                    (anState.dir === "short" && anState.trend === "up");
    if (counter) {
        if (!anState.reason.trim()) issues.push({ level: "bad", text: "Сделка против старшего тренда: укажите причину" });
        else issues.push({ level: "warn", text: "Сделка против старшего тренда (причина указана)" });
    }

    if (anState.phase === "impulse" && !counter) {
        issues.push({ level: "warn", text: "Цена в импульсе: лучше дождаться коррекции к зоне, а не догонять" });
    }

    const calc = anCalc();
    if (calc.state === "ok") {
        if (calc.loss > calc.buffer) issues.push({ level: "bad", text: "Свободных денег не хватит дойти до стопа: уменьшите объём или сдвиньте стоп" });
        if (calc.rr < 1.5) issues.push({ level: "warn", text: "Прибыль к риску " + "1 : " + pfNum(calc.rr, 2) + ": ищите тейк дальше (цель — от 1 : 2)" });
        if (calc.limit > 0 && calc.lossPct > calc.limit) issues.push({ level: "warn", text: "Потеря по стопу " + pfNum(calc.lossPct, 2) + "% выше порога " + pfNum(calc.limit, 1) + "%" });
    } else if (calc.state === "error") {
        issues.push({ level: "bad", text: calc.msg });
    }

    const base = { counter, zoneCount };
    const parts = anScoreParts(base, calc);
    const score = parts.reduce((s, p) => s + p.v, 0);

    let verdict, cls;
    if (issues.some(i => i.level === "bad")) { verdict = "Не входить"; cls = "an-red"; }
    else if (issues.length || score < 60) { verdict = "С осторожностью"; cls = "an-amber"; }
    else {
        verdict = "Сильный сетап"; cls = "an-green";
        issues.push({ level: "ok", text: "Контекст, зона, подтверждение и риск на месте" });
    }
    const order = { bad: 0, warn: 1, ok: 2 };
    issues.sort((a, b) => order[a.level] - order[b.level]);

    return { verdict, cls, issues, zoneCount, counter, score, parts };
}

// ---------- расчёт сделки по фьючерсу ----------

function anCalc() {
    const dir = anState.dir;
    const E = anNum("anEntry"), S = anNum("anStop"), T = anNum("anTake");
    const portfolio = anNum("anPortfolio"), free = anNum("anFree");
    const share = anNum("anShare"), limit = anNum("anRiskLimit");
    const go = anNum(dir === "long" ? "anGoBuy" : "anGoSell");
    const step = anNum("anStep"), stepAmt = anNum("anStepAmt");

    if (!(go > 0) || !(step > 0) || !(stepAmt > 0)) {
        return { state: "empty", msg: "Введите тикер и нажмите «Найти»: вход, стоп, тейк и расчёт риска подставятся сами." };
    }
    if (!(E > 0) || !(S > 0) || !(T > 0)) {
        return { state: "empty", msg: "Укажите вход, стоп и тейк." };
    }
    if (!(portfolio > 0) || !(share > 0)) {
        return { state: "empty", msg: "Укажите стоимость портфеля и долю в сделке (раздел «Подробнее»)." };
    }

    const okSide = dir === "long" ? (S < E && T > E) : (T < E && E < S);
    if (!okSide) {
        return {
            state: "error",
            msg: dir === "long"
                ? "Для лонга стоп должен быть ниже входа, а тейк выше."
                : "Для шорта стоп должен быть выше входа, а тейк ниже."
        };
    }

    const pv = stepAmt / step;                 // рублей за 1 пункт у одного контракта
    const stopPts = Math.abs(E - S);
    const takePts = Math.abs(T - E);
    const amount = portfolio * share / 100;    // капитал, выделенный на сделку
    const n = Math.floor(amount / go);

    if (n < 1) {
        const needPct = Math.ceil(go / portfolio * 100);
        return {
            state: "error",
            msg: `Не хватает на 1 контракт: ГО ${anRub(go)}, а в сделке ${anRub(amount)} (${pfNum(share, 1)}% портфеля). Нужно хотя бы ${needPct}% портфеля.`
        };
    }

    const loss = n * stopPts * pv;
    const profit = n * takePts * pv;
    const rr = takePts / stopPts;
    const notional = n * E * pv;
    const leverage = notional / amount;
    const used = n * go;
    const cushion = amount - used;             // свободный запас внутри суммы сделки
    const buffer = isFinite(free) ? Math.max(0, free - used) : cushion;
    const lossPct = loss / portfolio * 100;
    const profitPct = profit / portfolio * 100;

    const move = (money) => money / (n * pv);  // сколько пунктов выдержит запас
    const priceAt = (pts) => dir === "long" ? E - pts : E + pts;

    return {
        state: "ok", n, go, pv, amount, used, loss, profit, rr, notional, leverage,
        cushion, buffer, lossPct, profitPct, limit, stopPts,
        cushionPts: move(cushion), bufferPts: move(buffer),
        cushionPx: priceAt(move(cushion)), bufferPx: priceAt(move(buffer)),
        dir, free
    };
}

function anRenderResult() {
    const el = document.getElementById("anResult");
    const more = document.getElementById("anResultMore");
    const r = anCalc();

    if (r.state === "empty") { el.innerHTML = `<p class="an-empty">${r.msg}</p>`; more.innerHTML = ""; return; }
    if (r.state === "error") { el.innerHTML = `<div class="an-chips"><div class="an-chip bad">${r.msg}</div></div>`; more.innerHTML = ""; return; }

    const chips = [];

    if (r.limit > 0 && r.lossPct > r.limit) {
        const streak = (1 - Math.pow(1 - r.lossPct / 100, 5)) * 100;
        chips.push(["warn", `Потеря по стопу ${pfNum(r.lossPct, 2)}% портфеля выше вашего порога ${pfNum(r.limit, 1)}%. Пять таких стопов подряд — около −${pfNum(streak, 1)}% портфеля.`]);
    }

    if (r.loss <= r.cushion) {
        chips.push(["ok", "Стоп покрывается деньгами, выделенными на сделку."]);
    } else if (r.loss <= r.buffer) {
        chips.push(["warn", "Потеря по стопу больше суммы сделки: покрывается за счёт других свободных денег на счёте."]);
    } else {
        chips.push(["bad", "Свободных денег не хватит, чтобы дойти до стопа: брокер может закрыть позицию раньше. Уменьшите объём или сдвиньте стоп."]);
    }

    if (r.rr < 1) chips.push(["warn", "Тейк ближе стопа: риск больше потенциальной прибыли."]);

    el.innerHTML = `
        <div class="an-tiles">
            <div class="an-tile"><span>Контрактов</span><b>${r.n}</b><small>ГО ${anRub(r.used)}</small></div>
            <div class="an-tile"><span>Прибыль к риску</span><b>1 : ${pfNum(r.rr, 2)}</b><small>${r.dir === "long" ? "лонг" : "шорт"}</small></div>
            <div class="an-tile"><span>Потеря по стопу</span><b class="pf-down">−${anRub(r.loss)}</b><small>${pfNum(r.lossPct, 2)}% портфеля</small></div>
            <div class="an-tile"><span>Прибыль у тейка</span><b class="pf-up">+${anRub(r.profit)}</b><small>${pfNum(r.profitPct, 2)}% портфеля</small></div>
        </div>
        <div class="an-chips">${chips.map(c => `<div class="an-chip ${c[0]}">${c[1]}</div>`).join("")}</div>`;

    const lvl = px => px > 0 ? "≈ " + anPx(px) : "недостижимо";
    let liq = `<div class="an-res-row"><span>Запас до исчерпания средств сделки</span><b>~${anPx(r.cushionPts)} п. (${lvl(r.cushionPx)})</b></div>`;
    if (r.buffer > r.cushion + 0.5) {
        liq += `<div class="an-res-row"><span>С учётом свободных денег счёта</span><b>~${anPx(r.bufferPts)} п. (${lvl(r.bufferPx)})</b></div>`;
    }
    more.innerHTML = `
        <div class="an-res-row"><span>Размер позиции · плечо</span><b>${anRub(r.notional)} · ×${pfNum(r.leverage, 1)}</b></div>
        ${liq}
        <p class="an-meta">Оценка без учёта комиссий и проскальзывания. Запас — приближение, а не точная цена принудительного закрытия.</p>`;
}

// ---------- общий перерисовщик ----------

function anUpdate() {
    if (!anInited) return;

    const ev = anEvaluate();
    const v = document.getElementById("anVerdict");
    v.textContent = ev.verdict;
    v.className = ev.cls;
    document.getElementById("anIssues").innerHTML =
        ev.issues.map(i => `<li class="${i.level}">${anEsc(i.text)}</li>`).join("");

    // коротко под вердиктом — главная причина; полный список в «Подробнее»
    document.getElementById("anHint").textContent = ev.issues.length ? ev.issues[0].text : "";
    document.getElementById("anScore").classList.toggle("an-idle", !anCurrentUid && !anManual.size);

    // кольцо и полоски по четырём блокам
    const ring = document.getElementById("anRing");
    const fg = document.getElementById("anRingFg");
    const circ = 2 * Math.PI * 52;
    ring.className = "an-ring " + ev.cls;
    fg.style.strokeDasharray = circ;
    fg.style.strokeDashoffset = circ * (1 - ev.score / 100);
    document.getElementById("anScoreNum").textContent = ev.score;
    document.getElementById("anBars").innerHTML = ev.parts.map(p => {
        const r = p.v / p.max;
        const tone = r >= 0.7 ? "hi" : r >= 0.4 ? "mid" : "lo";
        return `<div class="an-bar ${tone}"><span>${p.k}</span><i><u style="width:${Math.round(r * 100)}%"></u></i><b>${p.v}/${p.max}</b></div>`;
    }).join("");

    document.getElementById("anZoneLine").textContent =
        "Сила зоны: " + AN_ZONE_NAMES[Math.min(ev.zoneCount, 3)] + " (совпало " + ev.zoneCount + " из 5)";

    const align = document.getElementById("anAlign");
    if (!anState.trend) align.textContent = "Выберите тренд на D / W, чтобы проверить направление сделки.";
    else if (ev.counter) align.textContent = "⚠ Сделка против старшего тренда — нужна понятная причина.";
    else if (anState.trend === "flat") align.textContent = "Флэт: торгуем от границ диапазона.";
    else align.textContent = "✓ Направление совпадает со старшим трендом.";

    const reason = document.getElementById("anReason");
    reason.classList.toggle("hidden", !ev.counter);

    anRenderResult();
}

// ---------- контракт: поиск и параметры ----------

async function anCall(body) {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return { ok: false, error: "Нет активной сессии" };

    const res = await fetch(functionsUrl("get-tinkoff-portfolio"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + session.access_token
        },
        body: JSON.stringify(body)
    });

    let data = {};
    try { data = await res.json(); } catch (e) { /* не JSON */ }
    return res.ok ? { ok: true, data } : { ok: false, error: data.error || "Ошибка запроса", code: data.code };
}

function anMsg(text, isError) {
    showAuthStatus("anMsg", text, isError);
}

async function anFind() {
    const q = document.getElementById("anTicker").value.trim();
    const btn = document.getElementById("anFind");
    const sel = document.getElementById("anContract");
    document.getElementById("anMsg").classList.add("hidden");

    if (!q) { anMsg("Введите тикер, например Si", true); return; }

    btn.disabled = true;
    btn.textContent = "Ищу…";

    try {
        const r = await anCall({ action: "futures_search", query: q });

        if (!r.ok) {
            if (r.code === "no_token") {
                anMsg("Токен T-Invest не подключён: заполните параметры контракта вручную.", true);
                document.getElementById("anMore").open = true;
                    document.getElementById("anDetails").open = true;
            } else {
                anMsg(r.error, true);
            }
            return;
        }

        anContracts = r.data.contracts || [];
        if (!anContracts.length) {
            sel.classList.add("hidden");
            anMsg("Фьючерс не найден. Проверьте тикер.", true);
            return;
        }

        sel.innerHTML = anContracts.map(c => {
            const exp = c.expiration ? " · до " + new Date(c.expiration).toLocaleDateString("ru-RU") : "";
            return `<option value="${anEsc(c.uid)}">${anEsc(c.ticker)} — ${anEsc(c.name)}${exp}</option>`;
        }).join("");
        sel.classList.toggle("hidden", anContracts.length < 2);
        sel.value = anContracts[0].uid;

        try { localStorage.setItem("anLastTicker", q); } catch (e) { /* не критично */ }
        await anLoadContract(anContracts[0].uid);
    } catch (e) {
        console.error("anFind error:", e);
        anMsg("Ошибка сети. Попробуйте ещё раз.", true);
    } finally {
        btn.disabled = false;
        btn.textContent = "Найти";
    }
}


async function anLoadContract(uid, silent) {
    if (!uid) return;
    if (!silent) document.getElementById("anMsg").classList.add("hidden");

    try {
        const r = await anCall({ action: "futures_analyze", uid });
        if (!r.ok) {
            if (!silent) anMsg(r.error, true);
            return;
        }

        const d = r.data.details;
        const c = anContracts.find(x => x.uid === uid) || {};

        // другой контракт — другой масштаб цен: план считаем заново
        if (anCurrentUid && anCurrentUid !== uid) {
            ["entry", "stop", "take"].forEach(k => anManual.delete(k));
            ["anEntry", "anStop", "anTake"].forEach(id => { document.getElementById(id).value = ""; });
        }
        anCurrentUid = uid;
        anLoadedAt = Date.now();

        // параметры контракта берём у брокера (при тихом обновлении не трогаем: пользователь мог их поправить)
        if (!silent) {
            document.getElementById("anGoBuy").value = d.marginBuy || "";
            document.getElementById("anGoSell").value = d.marginSell || "";
            document.getElementById("anStep").value = d.step || "";
            document.getElementById("anStepAmt").value = d.stepAmount || "";
        }

        anAnalysis = r.data.analysis || null;
        if (!anAnalysis && !silent) {
            anMsg("Автоанализ недоступен (" + (r.data.analysisError || "нет данных") + "). Отметки и цены можно ввести вручную.", true);
        }

        const parts = [anEsc(c.ticker || document.getElementById("anTicker").value.toUpperCase()),
            "ГО " + anRub(d.marginBuy) + " / " + anRub(d.marginSell)];
        if (d.pointValue) parts.push("1 пункт = " + anRub(d.pointValue));
        if (d.lastPrice) parts.push("цена " + anPx(d.lastPrice));
        parts.push("обновлено " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
        document.getElementById("anContractLine").innerHTML = parts.join(" · ");

        // нет автоанализа — хотя бы подставим цену как вход
        if (!anAnalysis && d.lastPrice && !anManual.has("entry") && !document.getElementById("anEntry").value) {
            document.getElementById("anEntry").value = d.lastPrice;
        }

        anRenderChart(c.ticker || document.getElementById("anTicker").value);
        anApplyAnalysis();
        anStartTimer();
    } catch (e) {
        console.error("anLoadContract error:", e);
        if (!silent) anMsg("Не удалось получить данные по контракту.", true);
    }
}

// ---------- график ----------
// TradingView: продолжение фьючерса вида MOEX:SI1!, по умолчанию 4H (как зона входа в стратегии)
let anChartKey = "";
let anChartTicker = "";

function anChartSymbol(ticker) {
    let s = String(ticker || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const m = s.match(/^([A-Z0-9]{2,4}?)[FGHJKMNQUVXZ]\d{1,2}$/); // SiZ6 -> SI
    if (m) s = m[1];
    return s ? "MOEX:" + s + "1!" : "";
}

function anRenderChart(ticker) {
    const wrap = document.getElementById("anChartWrap");
    if (ticker) anChartTicker = ticker;
    const symbol = anChartSymbol(anChartTicker);
    if (!symbol) { wrap.classList.add("hidden"); return; }

    const theme = document.documentElement.classList.contains("light-theme") ? "light" : "dark";
    const key = symbol + "|" + theme;
    wrap.classList.remove("hidden");
    if (key === anChartKey) return;   // тихие обновления раз в минуту не перезагружают график
    anChartKey = key;

    const p = new URLSearchParams({
        symbol: symbol,
        interval: "240",
        theme: theme,
        style: "1",
        locale: "ru",
        timezone: "Europe/Moscow",
        hidesidetoolbar: "1",
        symboledit: "0",
        saveimage: "0",
        withdateranges: "1"
    });
    document.getElementById("anChart").src = "https://s.tradingview.com/widgetembed/?" + p.toString();
    document.getElementById("anChartLink").href =
        "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(symbol);
}

function anStartTimer() {
    if (anTimer) return;
    anTimer = setInterval(async () => {
        if (document.hidden || !anCurrentUid) return;
        if (document.getElementById("analysisPage").classList.contains("hidden")) return;
        await anLoadContract(anCurrentUid, true);
    }, 60000);
}

function anSetCheck(key, value) {
    anState.checks[key] = !!value;
    const el = document.querySelector('#analysisPage input[data-k="' + key + '"]');
    if (el) el.checked = !!value;
}

// Выставляет отметки и цены по автоанализу. Всё, что пользователь менял сам, не трогаем.
function anApplyAnalysis() {
    const A = anAnalysis;
    if (!A) { anRenderFound(); anUpdate(); return; }

    const auto = (key, fn) => { if (!anManual.has(key)) fn(); };

    auto("trend", () => { anState.trend = A.trend; });
    auto("phase", () => { anState.phase = A.phase; });
    auto("levels", () => anSetCheck("levels", A.levels.length >= 2));
    auto("poc", () => anSetCheck("poc", !!A.profile));

    const plan = A.plans[anState.dir];
    const factors = plan ? plan.zone.factors : [];
    AN_ZONE_KEYS.forEach(k => auto(k, () => anSetCheck(k, factors.indexOf(k) !== -1)));

    const cf = A.confirm[anState.dir];
    auto("c_bar", () => anSetCheck("c_bar", cf.bar));
    auto("c_vol", () => anSetCheck("c_vol", cf.vol));

    const field = (key, id, val) => auto(key, () => {
        document.getElementById(id).value = val == null ? "" : val;
    });
    field("entry", "anEntry", plan ? plan.entry : A.price);
    field("stop", "anStop", plan ? plan.stop : "");
    field("take", "anTake", plan ? plan.take : "");

    anSyncSegs();
    anRenderFound();
    anUpdate();
}

// Показываем, что именно нашёл алгоритм, чтобы это можно было сверить с графиком
function anRenderFound() {
    const box = document.getElementById("anFound");
    const note = document.getElementById("anAutoNote");
    const A = anAnalysis;

    if (!A) {
        box.classList.add("hidden");
        note.classList.add("hidden");
        return;
    }
    box.classList.remove("hidden");
    note.classList.remove("hidden");
    note.textContent = "Отметки и цены выставлены автоматически по свечам T-Invest (D / W / 4H) и обновляются раз в минуту. Если поменяете что-то сами, это больше не перезаписывается.";

    const plan = A.plans[anState.dir];
    const cf = A.confirm[anState.dir];
    const row = (label, html) => `<div class="an-found-row"><span>${label}</span>${html}</div>`;
    const dirName = anState.dir === "long" ? "лонга" : "шорта";

    let html = "";
    html += row("Тренд D / W", `<b>${AN_TREND[A.trend]}, фаза: ${AN_PHASE[A.phase]}<small>${anEsc(A.trendDetail)}</small></b>`);

    if (A.levels.length) {
        html += row("Ключевые уровни", `<div class="an-tags">${A.levels.map(l =>
            `<span class="an-tag ${l.kind}">${anPx(l.price)}${l.touches > 1 ? " ×" + l.touches : ""}</span>`).join("")}</div>`);
    }

    if (A.profile) {
        const p = A.profile;
        html += row("Профиль объёма 4H (30 дней)",
            `<b>POC ${anPx(p.poc)} · VAH ${anPx(p.vah)} · VAL ${anPx(p.val)}` +
            (p.nodes.length ? `<small>Узлы: ${p.nodes.map(anPx).join(", ")}</small>` : "") + `</b>`);
    }

    if (A.fib) {
        html += row("Фибоначчи (последний импульс)",
            `<b>${A.fib.up ? "вверх" : "вниз"} ${anPx(A.fib.lo)} – ${anPx(A.fib.hi)}<small>` +
            A.fib.levels.map(f => f.r + " → " + anPx(f.price)).join(" · ") + `</small></b>`);
    }

    if (A.zones.length) {
        html += row("Ближайшие зоны", `<b>` + A.zones.map(z =>
            `${anPx(z.lo)} – ${anPx(z.hi)} · ${z.count} ${z.count === 1 ? "фактор" : "фактора"}: ${anEsc(z.labels.join(", "))}` +
            (z.level ? " + уровень D/W" : "")).join("<br>") + `</b>`);
    }

    if (plan) {
        html += row("Зона для " + dirName,
            `<b>${anPx(plan.zone.lo)} – ${anPx(plan.zone.hi)}: ${plan.inZone ? "цена в зоне" : "цена пока не дошла до зоны"}` +
            `<small>Тейк: ${anEsc(plan.takeNote)}</small></b>`);
    } else {
        html += row("Зона для " + dirName, `<b>Рядом нет подходящей зоны<small>Вход не предлагается — ждём, пока цена подойдёт к зоне.</small></b>`);
    }
    html += row("Подтверждение", `<b>${anEsc(cf.desc)}</b>`);

    document.getElementById("anFoundBody").innerHTML = html;
}


function anReset() {
    anState.trend = "";
    anState.phase = "";
    anState.reason = "";
    anState.checks = {};
    anManual.clear();
    document.querySelectorAll("#analysisPage .an-check input").forEach(i => { i.checked = false; });
    ["anReason", "anEntry", "anStop", "anTake"].forEach(id => { document.getElementById(id).value = ""; });
    anSyncSegs();
    // возвращаем значения автоанализа
    anApplyAnalysis();
}