import campaignsMock from '../mock/campaigns.json';

const CAMPAIGNS_STORAGE_KEY = 'engineer_dashboard_campaigns';

export const campaignService = {
  initializeCampaigns: () => {
    if (!localStorage.getItem(CAMPAIGNS_STORAGE_KEY)) {
      localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaignsMock));
    }
  },

  getCampaigns: () => {
    campaignService.initializeCampaigns();
    const data = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveCampaigns: (campaigns) => {
    localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
  },

  updateCampaignStatus: (campaignId, status) => {
    const campaigns = campaignService.getCampaigns();
    const updated = campaigns.map(c => c.id === campaignId ? { ...c, status } : c);
    campaignService.saveCampaigns(updated);
    return updated;
  },

  createCampaign: (campaign) => {
    const campaigns = campaignService.getCampaigns();
    const newCamp = {
      id: `camp_${Date.now()}`,
      name: campaign.name,
      type: campaign.type,
      audienceCount: parseInt(campaign.audienceCount) || 0,
      sentCount: 0,
      pendingCount: parseInt(campaign.audienceCount) || 0,
      lastSent: 'Never',
      status: 'draft'
    };
    const updated = [newCamp, ...campaigns];
    campaignService.saveCampaigns(updated);
    return updated;
  }
};
