import salesMock from '../mock/sales.json';

const SALES_STORAGE_KEY = 'engineer_dashboard_sales';

export const salesService = {
  initializeSales: () => {
    if (!localStorage.getItem(SALES_STORAGE_KEY)) {
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(salesMock));
    }
  },

  getSales: () => {
    salesService.initializeSales();
    const data = localStorage.getItem(SALES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveSales: (sales) => {
    localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
  },

  addFollowUp: (saleId, note, nextCallingDate) => {
    const sales = salesService.getSales();
    const updated = sales.map((sale) => {
      if (sale.id === saleId) {
        const nextId = sale.followUps.length > 0 ? Math.max(...sale.followUps.map(f => f.id)) + 1 : 1;
        const newFollowUp = {
          id: nextId,
          note,
          nextCallingDate,
          createdAt: new Date().toISOString().split('T')[0]
        };
        return {
          ...sale,
          followUps: [newFollowUp, ...sale.followUps]
        };
      }
      return sale;
    });
    salesService.saveSales(updated);
    return updated;
  },

  addPayment: (saleId, payment) => {
    const sales = salesService.getSales();
    const updated = sales.map((sale) => {
      if (sale.id === saleId) {
        const nextId = sale.payments.length > 0 ? Math.max(...sale.payments.map(p => p.id)) + 1 : 1;
        const newPayment = {
          id: nextId,
          amount: parseFloat(payment.amount),
          mode: payment.mode,
          proof: payment.proof || '',
          remarks: payment.remarks || '',
          receivedAt: payment.receivedAt || new Date().toISOString().split('T')[0]
        };

        const totalReceived = sale.receivedAmount + newPayment.amount;
        const totalPending = Math.max(0, sale.totalAmount - totalReceived);
        let status = 'pending';
        if (totalPending === 0) {
          status = 'received';
        } else if (totalReceived > 0) {
          status = 'partial';
        }

        return {
          ...sale,
          receivedAmount: totalReceived,
          pendingAmount: totalPending,
          status,
          payments: [...sale.payments, newPayment]
        };
      }
      return sale;
    });
    salesService.saveSales(updated);
    return updated;
  },

  addUnifiedEntry: (data) => {
    const sales = salesService.getSales();
    const existingSaleIndex = sales.findIndex(s => s.invoiceNo === data.invoiceNo);
    
    let sale;
    if (existingSaleIndex >= 0) {
      sale = { ...sales[existingSaleIndex] };
    } else {
      sale = {
        id: `sale_${Date.now()}`,
        followUpNo: `FU-${Math.floor(Math.random() * 10000)}`,
        customerName: data.customerName,
        phone: data.phone,
        invoiceDate: data.invoiceDate,
        invoiceNo: data.invoiceNo,
        totalAmount: data.amount ? parseFloat(data.amount) : 0, 
        receivedAmount: 0,
        pendingAmount: 0,
        status: 'pending',
        billCopy: data.billCopy || '',
        followUps: [],
        payments: []
      };
    }

    // Update common fields
    sale.customerName = data.customerName;
    sale.phone = data.phone;
    sale.invoiceDate = data.invoiceDate;
    if (data.billCopy) sale.billCopy = data.billCopy;

    if (data.type === 'follow_up') {
      const nextId = sale.followUps.length > 0 ? Math.max(...sale.followUps.map(f => f.id)) + 1 : 1;
      sale.followUps = [{
        id: nextId,
        note: data.note,
        nextCallingDate: data.nextCallingDate,
        createdAt: data.createdAt || new Date().toISOString().split('T')[0]
      }, ...sale.followUps];
    } else if (data.type === 'payment') {
      const nextId = sale.payments.length > 0 ? Math.max(...sale.payments.map(p => p.id)) + 1 : 1;
      const paymentAmount = parseFloat(data.amount);
      sale.payments = [...sale.payments, {
        id: nextId,
        amount: paymentAmount,
        mode: data.paymentMode,
        proof: data.proof || '',
        remarks: data.remarks || '',
        receivedAt: data.createdAt || new Date().toISOString().split('T')[0]
      }];
      
      sale.receivedAmount += paymentAmount;
      if (existingSaleIndex < 0) {
          sale.totalAmount = paymentAmount; // New sale just recorded payment
      }
      sale.pendingAmount = Math.max(0, sale.totalAmount - sale.receivedAmount);
      
      if (sale.pendingAmount === 0) {
        sale.status = 'received';
      } else if (sale.receivedAmount > 0) {
        sale.status = 'partial';
      }
    }

    if (existingSaleIndex >= 0) {
      sales[existingSaleIndex] = sale;
    } else {
      sales.unshift(sale); // Add to top
    }
    
    salesService.saveSales(sales);
    return sales;
  }
};
