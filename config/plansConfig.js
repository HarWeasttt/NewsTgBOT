const fs = require('fs');
const path = require('path');
const { SUBSCRIPTION_PLANS } = require('./index');

const PLANS_CONFIG_PATH = path.join(__dirname, 'plans.json');

// Загрузка кастомных тарифов из файла
function loadCustomPlans() {
  try {
    if (fs.existsSync(PLANS_CONFIG_PATH)) {
      const customPlans = JSON.parse(fs.readFileSync(PLANS_CONFIG_PATH, 'utf8'));
      Object.assign(SUBSCRIPTION_PLANS, customPlans);
      console.log('✅ Custom plans loaded');
    }
  } catch (error) {
    console.error('Error loading custom plans:', error);
  }
}

// Сохранение изменений тарифов
function savePlanChanges(planKey, changes) {
  try {
    let customPlans = {};
    
    if (fs.existsSync(PLANS_CONFIG_PATH)) {
      customPlans = JSON.parse(fs.readFileSync(PLANS_CONFIG_PATH, 'utf8'));
    }
    
    customPlans[planKey] = SUBSCRIPTION_PLANS[planKey];
    
    fs.writeFileSync(PLANS_CONFIG_PATH, JSON.stringify(customPlans, null, 2));
    console.log(`✅ Plan ${planKey} saved`);
    
    return true;
  } catch (error) {
    console.error('Error saving plan:', error);
    return false;
  }
}

// Сброс тарифов к значениям по умолчанию
function resetToDefault() {
  try {
    if (fs.existsSync(PLANS_CONFIG_PATH)) {
      fs.unlinkSync(PLANS_CONFIG_PATH);
      console.log('✅ Plans reset to default');
    }
  } catch (error) {
    console.error('Error resetting plans:', error);
  }
}

module.exports = {
  loadCustomPlans,
  savePlanChanges,
  resetToDefault,
  PLANS_CONFIG_PATH
};