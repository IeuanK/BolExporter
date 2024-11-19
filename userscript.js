// ==UserScript==
// @name         Bol.com Order Export
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Export Bol.com orders to CSV
// @author       You
// @match        https://www.bol.com/nl/rnwy/account/bestellingen/overzicht
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const dutchMonths = {
        'januari': '01',
        'februari': '02',
        'maart': '03',
        'april': '04',
        'mei': '05',
        'juni': '06',
        'juli': '07',
        'augustus': '08',
        'september': '09',
        'oktober': '10',
        'november': '11',
        'december': '12'
    };

    function createExportPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: white;
            padding: 15px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 1000;
        `;

        const currentYear = new Date().getFullYear();
        const yearOptions = Array.from({length: 9}, (_, i) => currentYear - i);

        panel.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 10px;">Alles exporteren</div>
            <div style="margin-bottom: 10px;">
                <label>exporteer t/m: </label>
                <select id="export-year" style="margin-right: 5px;">
                    ${yearOptions.map(year => `<option value="${year}">${year}</option>`).join('')}
                </select>
                <select id="export-month">
                    ${Object.entries(dutchMonths).map(([month, num]) =>
                        `<option value="${num}">${month}</option>`
                    ).join('')}
                </select>
            </div>
            <button id="export-button" style="width: 100%; padding: 5px;">Exporteer</button>
            <div id="export-log" style="height: 100px; overflow-y: auto; margin-top: 10px; border: 1px solid #ccc; padding: 5px; display: none; font-family: monospace; font-size: 12px;"></div>
        `;

        document.body.appendChild(panel);
        return panel;
    }

    async function fetchOrders(url) {
        const response = await fetch(url);
        return response.json();
    }

    function parsePrice(priceStr) {
        return parseFloat(priceStr.replace('€', '').trim().replace(',', '.'));
    }

    function formatDate(dutchDate) {
        const [day, monthStr, year] = dutchDate.split(' ');
        const month = dutchMonths[monthStr.toLowerCase()];
        return `${year}-${month}-${day.padStart(2, '0')}`;
    }

    async function getAllOrders(csrf, targetDate, logElement) {
        let allOrders = [];
        let nextUrl = `https://www.bol.com/nl/rnwy/ajax/order_overview?fromOrderId=0&search=&_csrf=${csrf}`;
        let requestCount = 0;

        while (nextUrl) {
            const data = await fetchOrders(nextUrl);
            if (!data.orders || data.orders.length === 0) break;

            requestCount++;
            const firstOrderDate = formatDate(data.orders[0].orderDate);
            const lastOrderDate = formatDate(data.orders[data.orders.length - 1].orderDate);

            const logMessage = `${requestCount}: ${lastOrderDate} - ${firstOrderDate}`;
            logElement.innerHTML += logMessage + '<br>';
            logElement.scrollTop = logElement.scrollHeight;

            allOrders = allOrders.concat(data.orders);

            if (new Date(lastOrderDate) < new Date(targetDate)) break;

            nextUrl = data.moreOrdersUrl || null;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return allOrders.filter(order =>
            new Date(formatDate(order.orderDate)) >= new Date(targetDate)
        );
    }

    function convertToCSV(orders) {
        const headers = ['orderDate', 'orderNumber', 'productTitle', 'quantity', 'pricePerPiece', 'totalPrice', 'payee'];
        const rows = orders.flatMap(order => {
            const date = formatDate(order.orderDate);
            return order.overviewOrderItems.map(item => [
                date,
                order.orderNumber,
                `BOL.COM ${order.orderNumber} - ${item.productTitle}`,
                item.quantity,
                parsePrice(item.pricePerPiece),
                item.quantity * parsePrice(item.pricePerPiece),
                'bol temp'
            ]);
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell =>
                typeof cell === 'string' ? `"${cell.replace(/"/g, '""')}"` : cell
            ).join(','))
        ].join('\n');

        return csvContent;
    }

    function downloadCSV(csvContent) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'bol_orders.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function initialize() {
        const panel = createExportPanel();
        const button = panel.querySelector('#export-button');

        button.addEventListener('click', async () => {
            const year = document.getElementById('export-year').value;
            const month = document.getElementById('export-month').value;
            const targetDate = `${year}-${month}-01`;

            const csrfMeta = document.querySelector('meta[name="csrf-token"]');
            if (!csrfMeta) {
                alert('CSRF token not found!');
                return;
            }

            button.disabled = true;
            button.textContent = 'Bezig met exporteren...';
            const logElement = document.getElementById('export-log');
            logElement.style.display = 'block';
            logElement.innerHTML = '';

            try {
                const orders = await getAllOrders(csrfMeta.content, targetDate, logElement);
                const csv = convertToCSV(orders);
                downloadCSV(csv);
            } catch (error) {
                console.error('Export failed:', error);
                alert('Export failed: ' + error.message);
            } finally {
                button.disabled = false;
                button.textContent = 'Exporteer';
            }
        });
    }

    // Wait for page to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
