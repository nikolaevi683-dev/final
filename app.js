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

            startApp();

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


async function sendLoginLink() {

    const email =
        document
            .getElementById("authEmail")
            .value
            .trim();


    if (!email) {

        showAuthStatus(
            "authStatus",
            "Введите email",
            true
        );

        return;
    }


    const button =
        document.getElementById(
            "authSendButton"
        );

    button.disabled = true;

    button.textContent =
        "Отправляем...";


    const { error } =
        await db.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo:
                    window.location.href
            }
        });


    button.disabled = false;

    button.textContent =
        "Получить ссылку для входа";


    if (error) {

        console.error(
            "Login link error:",
            error
        );

        showAuthStatus(
            "authStatus",
            "Не удалось отправить ссылку: " +
                error.message,
            true
        );

        return;
    }


    showAuthStatus(
        "authStatus",
        "Ссылка отправлена на " +
            email +
            ". Откройте её с этого устройства."
    );
}


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
}


// =========================================
// NAVIGATION
// =========================================

function showHome() {

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
        .getElementById("homeNav")
        .classList.add("active");


    document
        .getElementById("profileNav")
        .classList.remove("active");


    renderCalendar();
}


function showProfile() {

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
        .getElementById("homeNav")
        .classList.remove("active");


    document
        .getElementById("profileNav")
        .classList.add("active");


    updateProfile();
}


// =========================================
// OPEN ALL TRADES
// =========================================

function openAllTrades() {

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
        .order(
            "created_at",
            {
                ascending: false
            }
        );


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

            pnlText =
                totalPnl > 0
                    ? "+" +
                      formatNumber(
                          totalPnl
                      ) +
                      " ₽"

                    : formatNumber(
                        totalPnl
                      ) +
                      " ₽";
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

function createTradeCard(
    trade
) {

    const item =
        document.createElement(
            "div"
        );


    item.className = "card";


    const pnl =
        Number(trade.pnl);


    const pnlText =
        pnl > 0
            ? "+" +
              formatNumber(pnl) +
              " ₽"

            : formatNumber(pnl) +
              " ₽";


    item.innerHTML = `

        <span>
            ${formatReadableDate(
                trade.trade_date
            )}
        </span>

        <strong>
            ${trade.symbol}
        </strong>

        <div>
            ${trade.direction}
            ·
            <b>
                ${pnlText}
            </b>
        </div>

    `;


    item.onclick =
        function () {

            openTradeDetails(
                trade
            );
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

    if (!dateString) {
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


    document
        .getElementById("tradeDetails")
        .classList.add("hidden");


    document
        .getElementById("homePage")
        .classList.remove("hidden");


    renderCalendar();
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
        document.querySelector(
            ".save-button"
        );


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
        document.querySelector(
            ".save-button"
        );


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
// START
// =========================================

// Приложение стартует само: подписка onAuthStateChange выше
// получает начальное состояние сессии сразу при регистрации
// и вызывает startApp() или показывает экран входа.