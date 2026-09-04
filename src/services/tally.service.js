import { salesService } from './sales.service';

export const tallyService = {
  reconcile: (uploadedTallyRecords) => {
    const sales = salesService.getSales();
    const tally = uploadedTallyRecords || [];

    const tallyMap = new Map(tally.map(t => [t.invoiceNo.trim().toUpperCase(), t]));
    const salesMap = new Map(sales.map(s => [s.invoiceNo.trim().toUpperCase(), s]));

    const results = [];

    // Check all sales records
    sales.forEach(sale => {
      const invoiceKey = sale.invoiceNo.trim().toUpperCase();
      const tallyRecord = tallyMap.get(invoiceKey);
      
      const salesReceived = sale.receivedAmount;
      const salesOverdue = sale.pendingAmount;

      if (!tallyRecord) {
        results.push({
          invoiceNo: sale.invoiceNo,
          invoiceDate: sale.invoiceDate,
          customerName: sale.customerName,
          receivedAmount: salesReceived,
          overdueAmount: salesOverdue,
          tallyOverdueAmount: null,
          variance: salesOverdue,
          status: 'missing_in_tally'
        });
      } else {
        const tallyOverdue = tallyRecord.overdueAmount;
        const variance = salesOverdue - tallyOverdue;
        const isMatched = Math.abs(variance) < 0.01;

        results.push({
          invoiceNo: sale.invoiceNo,
          invoiceDate: sale.invoiceDate,
          customerName: sale.customerName,
          receivedAmount: salesReceived,
          overdueAmount: salesOverdue,
          tallyOverdueAmount: tallyOverdue,
          variance: variance,
          status: isMatched ? 'matched' : 'unmatched'
        });
      }
    });

    // Check tally records that are missing in sales
    tally.forEach(t => {
      const invoiceKey = t.invoiceNo.trim().toUpperCase();
      if (!salesMap.has(invoiceKey)) {
        const tallyOverdue = t.overdueAmount;
        results.push({
          invoiceNo: t.invoiceNo,
          invoiceDate: t.invoiceDate || '',
          customerName: t.customerName || 'Tally Client',
          receivedAmount: null,
          overdueAmount: null,
          tallyOverdueAmount: tallyOverdue,
          variance: -tallyOverdue,
          status: 'missing_in_sales'
        });
      }
    });

    return results;
  }
};
