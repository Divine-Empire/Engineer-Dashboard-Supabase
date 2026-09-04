import { salesService } from './sales.service';

export const dashboardService = {
  getDashboardData: (dateRange = null) => {
    let sales = salesService.getSales();

    // Apply global date filters if any
    if (dateRange && dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      sales = sales.filter((sale) => {
        const date = new Date(sale.invoiceDate);
        return date >= start && date <= end;
      });
    }

    // Totals calculations
    let totalRevenue = 0;
    let receivedAmount = 0;
    let pendingAmount = 0;
    let overdueAmount = 0;
    const uniqueCustomers = new Set();
    const invoicesCount = sales.length;

    // Today mock reference date
    const today = new Date('2026-05-20');

    sales.forEach((sale) => {
      totalRevenue += sale.totalAmount;
      receivedAmount += sale.receivedAmount;
      pendingAmount += sale.pendingAmount;
      uniqueCustomers.add(sale.customerName);

      // Overdue logic: pending amount > 0 AND invoiceDate is older than 10 days from 2026-05-20
      const invoiceDate = new Date(sale.invoiceDate);
      const diffTime = today - invoiceDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (sale.pendingAmount > 0 && diffDays > 10) {
        overdueAmount += sale.pendingAmount;
      }
    });

    // Recent Follow-ups widget
    const recentFollowUps = [];
    sales.forEach((sale) => {
      sale.followUps.forEach((fu) => {
        recentFollowUps.push({
          saleId: sale.id,
          invoiceNo: sale.invoiceNo,
          customerName: sale.customerName,
          note: fu.note,
          nextCallingDate: fu.nextCallingDate,
          createdAt: fu.createdAt
        });
      });
    });
    // Sort recent follow-ups by createdAt descending
    recentFollowUps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Revenue Trend Chart data (e.g. aggregate by date)
    const trendMap = {};
    sales.forEach((sale) => {
      const dateStr = sale.invoiceDate;
      if (!trendMap[dateStr]) {
        trendMap[dateStr] = { date: dateStr, revenue: 0, received: 0 };
      }
      trendMap[dateStr].revenue += sale.totalAmount;
      trendMap[dateStr].received += sale.receivedAmount;
    });
    const revenueTrend = Object.values(trendMap).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    // Payment Status Pie Chart data
    const statusCounts = { pending: 0, partial: 0, received: 0 };
    sales.forEach((sale) => {
      statusCounts[sale.status] = (statusCounts[sale.status] || 0) + 1;
    });
    const statusData = Object.entries(statusCounts).map(([status, value]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value
    }));

    // Pending Payments Table: top pending payments
    const pendingPayments = sales
      .filter((sale) => sale.pendingAmount > 0)
      .sort((a, b) => b.pendingAmount - a.pendingAmount);

    return {
      metrics: {
        totalRevenue,
        receivedAmount,
        pendingAmount,
        overdueAmount,
        customersCount: uniqueCustomers.size,
        invoicesCount
      },
      revenueTrend,
      statusData,
      recentFollowUps: recentFollowUps.slice(0, 5),
      pendingPayments: pendingPayments.slice(0, 5)
    };
  }
};
