// options.js
document.addEventListener('DOMContentLoaded', function() {
  applyI18n();
  document.title = t('optionsTitle');

  // 获取DOM元素
  const schemeSelect = document.getElementById('schemeSelect');
  const scheme1Content = document.getElementById('scheme1Content');
  const scheme2Content = document.getElementById('scheme2Content');
  const scheme3Content = document.getElementById('scheme3Content');
  const scheme1Rows = document.getElementById('scheme1Rows');
  const scheme2Rows = document.getElementById('scheme2Rows');
  const scheme3Rows = document.getElementById('scheme3Rows');
  const scheme1EditBtn = document.getElementById('scheme1EditBtn');
  const scheme2EditBtn = document.getElementById('scheme2EditBtn');
  const scheme3EditBtn = document.getElementById('scheme3EditBtn');
  const scheme1AddRowBtn = document.getElementById('scheme1AddRowBtn');
  const scheme2AddRowBtn = document.getElementById('scheme2AddRowBtn');
  const scheme3AddRowBtn = document.getElementById('scheme3AddRowBtn');
  const sensitivityValue = document.getElementById('sensitivityValue');
  const sensitivityPlus = document.getElementById('sensitivityPlus');
  const sensitivityMinus = document.getElementById('sensitivityMinus');
  const maxResolutionInput = document.getElementById('maxResolutionInput');
  const resolutionEditBtn = document.getElementById('resolutionEditBtn');

  // 默认方案设置
  const defaultSchemes = {
    1: [
      { min: 0, max: 10, speed: 3.0 },
      { min: 10, max: 20, speed: 2.0 },
      { min: 20, max: 40, speed: 1.5 },
      { min: 40, max: 80, speed: 1.0 },
      { min: 60, max: 70, speed: 0.8 },
      { min: 80, max: 100, speed: 0.5 }
    ],
    2: [
      { min: 0, max: 15, speed: 2.0 },
      { min: 15, max: 30, speed: 1.0 },
      { min: 30, max: 60, speed: 0.7 },
      { min: 60, max: 100, speed: 0.5 }
    ],
    3: [
      { min: 0, max: 25, speed: 2.0 },
      { min: 25, max: 100, speed: 1.0 }
    ]
  };

  // 默认灵敏度
  const defaultSensitivity = 6;

  // 默认最大分辨率
  const defaultMaxResolution = 480;

  // 加载设置
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['scheme', 'schemes', 'sensitivity', 'maxResolution']);
      
      // 设置当前方案
      const currentScheme = result.scheme || 1;
      schemeSelect.value = currentScheme;
      showSchemeContent(currentScheme);
      
      // 设置方案数据
      const schemes = result.schemes || defaultSchemes;
      renderSchemeRows(1, schemes[1] || defaultSchemes[1]);
      renderSchemeRows(2, schemes[2] || defaultSchemes[2]);
      renderSchemeRows(3, schemes[3] || defaultSchemes[3]);
      
      // 设置灵敏度
      const sensitivity = result.sensitivity || defaultSensitivity;
      sensitivityValue.textContent = sensitivity;

      // 设置最大分辨率
      const maxResolution = result.maxResolution || defaultMaxResolution;
      maxResolutionInput.value = maxResolution;
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  // 显示对应的方案内容
  function showSchemeContent(schemeNum) {
    scheme1Content.classList.remove('active');
    scheme2Content.classList.remove('active');
    scheme3Content.classList.remove('active');
    
    document.getElementById(`scheme${schemeNum}Content`).classList.add('active');
  }

  // 渲染方案行
  function renderSchemeRows(schemeNum, rows) {
    const container = document.getElementById(`scheme${schemeNum}Rows`);
    container.innerHTML = '';
    
    rows.forEach((row, index) => {
      const rowElement = createSchemeRow(schemeNum, index, row);
      container.appendChild(rowElement);
    });
  }

  // 创建方案行元素
  function createSchemeRow(schemeNum, index, rowData) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'scheme-row';
    rowDiv.dataset.index = index;
    
    rowDiv.innerHTML = `
      <input type="number" class="min-input" min="0" max="100" value="${rowData.min}" readonly>
      <span>~</span>
      <input type="number" class="max-input" min="0" max="100" value="${rowData.max}" readonly>
      <span class="speed-label"></span>
      <input type="number" class="speed-input" min="0.1" max="4.0" step="0.1" value="${rowData.speed}" readonly>
      <button class="remove-row-btn" style="display:none;"></button>
    `;

    rowDiv.querySelector('.speed-label').textContent = t('speedLabel');
    rowDiv.querySelector('.remove-row-btn').textContent = t('btnRemoveRow');
    
    // 添加事件监听器
    const minInput = rowDiv.querySelector('.min-input');
    const maxInput = rowDiv.querySelector('.max-input');
    const speedInput = rowDiv.querySelector('.speed-input');
    const removeBtn = rowDiv.querySelector('.remove-row-btn');
    
    minInput.addEventListener('change', function() {
      let value = parseInt(this.value);
      if (value < 0) value = 0;
      if (value > 100) value = 100;
      this.value = value;
      
      // 当修改最小值时，如果当前行不是第一行，同时更新上一行的最大值
      if (index > 0) {
        const prevRow = rowDiv.previousElementSibling;
        if (prevRow) {
          const prevMaxInput = prevRow.querySelector('.max-input');
          if (prevMaxInput) {
            prevMaxInput.value = value;
          }
        }
      }
    });
    
    maxInput.addEventListener('change', function() {
      let value = parseInt(this.value);
      if (value < 0) value = 0;
      if (value > 100) value = 100;
      this.value = value;
      
      // 当修改最大值时，如果当前行不是最后一行，同时更新下一行的最小值
      const container = rowDiv.parentElement;
      if (index < container.children.length - 1) {
        const nextRow = rowDiv.nextElementSibling;
        if (nextRow) {
          const nextMinInput = nextRow.querySelector('.min-input');
          if (nextMinInput) {
            nextMinInput.value = value;
          }
        }
      }
    });
    
    speedInput.addEventListener('change', function() {
      let value = parseFloat(this.value);
      if (value < 0.1) value = 0.1;
      if (value > 4.0) value = 4.0;
      // 保留一位小数
      this.value = value.toFixed(1);
    });
    
    removeBtn.addEventListener('click', function() {
      rowDiv.remove();
    });
    
    return rowDiv;
  }

  // 切换方案
  schemeSelect.addEventListener('change', function() {
    const schemeNum = parseInt(this.value);
    showSchemeContent(schemeNum);
    saveCurrentScheme(schemeNum);
  });

  // 保存当前方案
  async function saveCurrentScheme(schemeNum) {
    try {
      await chrome.storage.sync.set({ scheme: schemeNum });
    } catch (error) {
      console.error('保存当前方案失败:', error);
    }
  }

  // 验证方案数据
  function validateScheme(rows) {
    if (rows.length === 0) {
      alert(t('validateEmpty'));
      return false;
    }
    
    // 检查第一行的左区间是否为0
    if (rows[0].min !== 0) {
      alert(t('validateFirstMinZero'));
      return false;
    }
    
    // 检查每一行的右区间是否比左区间大
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].min >= rows[i].max) {
        alert(t('validateRangeError', String(i + 1)));
        return false;
      }
    }
    
    // 检查最后一行的右区间是否为100
    if (rows[rows.length - 1].max !== 100) {
      alert(t('validateLastMaxHundred'));
      return false;
    }
    
    // 检查区间是否连续且无重叠 - 修正：区间应是连续的，上一行的max应等于下一行的min
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i].max !== rows[i + 1].min) {
        alert(t('validateContinuous', String(i + 1), String(rows[i].max), String(i + 2), String(rows[i + 1].min)));
        return false;
      }
    }
    
    return true;
  }

  // 编辑方案按钮事件
  function setupEditButton(btn, schemeNum, addRowBtn) {
    let isEditing = false;
    
    btn.addEventListener('click', async function() {
      if (isEditing) {
        // 保存设置
        const rows = [];
        const container = document.getElementById(`scheme${schemeNum}Rows`);
        const rowElements = container.querySelectorAll('.scheme-row');
        
        rowElements.forEach(rowElement => {
          const minInput = rowElement.querySelector('.min-input');
          const maxInput = rowElement.querySelector('.max-input');
          const speedInput = rowElement.querySelector('.speed-input');
          
          rows.push({
            min: parseInt(minInput.value),
            max: parseInt(maxInput.value),
            speed: parseFloat(speedInput.value)
          });
        });
        
        // 验证方案数据
        if (!validateScheme(rows)) {
          return;
        }
        
        // 保存到存储
        try {
          const result = await chrome.storage.sync.get(['schemes']);
          const schemes = result.schemes || defaultSchemes;
          schemes[schemeNum] = rows;
          await chrome.storage.sync.set({ schemes: schemes });
          
          // 更新按钮文本
          btn.textContent = t('btnEdit');
          isEditing = false;
          
          // 隐藏添加行按钮
          addRowBtn.style.display = 'none';
          
          // 禁用输入框和删除按钮
          rowElements.forEach(rowElement => {
            const inputs = rowElement.querySelectorAll('input');
            const removeBtn = rowElement.querySelector('.remove-row-btn');
            inputs.forEach(input => {
              input.setAttribute('readonly', true);
            });
            removeBtn.style.display = 'none';
          });
        } catch (error) {
          console.error('保存方案失败:', error);
        }
      } else {
        // 进入编辑模式
        btn.textContent = t('btnSave');
        isEditing = true;
        
        const container = document.getElementById(`scheme${schemeNum}Rows`);
        const rowElements = container.querySelectorAll('.scheme-row');
        
        // 启用输入框和删除按钮
        rowElements.forEach(rowElement => {
          const inputs = rowElement.querySelectorAll('input');
          const removeBtn = rowElement.querySelector('.remove-row-btn');
          inputs.forEach(input => {
            input.removeAttribute('readonly');
          });
          removeBtn.style.display = 'inline-block';
        });
        
        // 显示添加行按钮
        addRowBtn.style.display = 'inline-block';
        
        // 添加添加行按钮事件
        addRowBtn.onclick = function() {
          const container = document.getElementById(`scheme${schemeNum}Rows`);
          const lastRow = container.lastElementChild;
          let newMin = 1;
          let newMax = 25;
          
          if (lastRow) {
            const lastMaxValue = parseInt(lastRow.querySelector('.max-input').value);
            newMin = lastMaxValue;
            newMax = Math.min(100, lastMaxValue + 25);
          }
          
          const newRowData = { min: newMin, max: newMax, speed: 1.0 };
          const newRowElement = createSchemeRow(schemeNum, container.children.length, newRowData);
          container.appendChild(newRowElement);
          
          // 启用新行的输入框
          const inputs = newRowElement.querySelectorAll('input');
          inputs.forEach(input => {
            input.removeAttribute('readonly');
          });
          newRowElement.querySelector('.remove-row-btn').style.display = 'inline-block';
        };
      }
    });
  }

  // 设置编辑按钮
  setupEditButton(scheme1EditBtn, 1, scheme1AddRowBtn);
  setupEditButton(scheme2EditBtn, 2, scheme2AddRowBtn);
  setupEditButton(scheme3EditBtn, 3, scheme3AddRowBtn);

  // 灵敏度控制
  sensitivityPlus.addEventListener('click', async function() {
    let value = parseInt(sensitivityValue.textContent);
    if (value < 20) {
      value++;
      sensitivityValue.textContent = value;
      try {
        await chrome.storage.sync.set({ sensitivity: value });
      } catch (error) {
        console.error('保存灵敏度失败:', error);
      }
    }
  });

  sensitivityMinus.addEventListener('click', async function() {
    let value = parseInt(sensitivityValue.textContent);
    if (value > 1) {
      value--;
      sensitivityValue.textContent = value;
      try {
        await chrome.storage.sync.set({ sensitivity: value });
      } catch (error) {
        console.error('保存灵敏度失败:', error);
      }
    }
  });


  // 初始化设置之前添加分辨率编辑按钮逻辑
  let isEditingResolution = false;

  resolutionEditBtn.addEventListener('click', async function() {
    if (isEditingResolution) {
      // 保存设置
      let resolution = parseInt(maxResolutionInput.value);
      
      // 验证分辨率
      if (isNaN(resolution) || resolution < 200) {
        resolution = 200; // 自动修正为最小值
        maxResolutionInput.value = resolution;
      }
      
      // 保存到存储
      try {
        await chrome.storage.sync.set({ maxResolution: resolution });
        
        // 更新按钮文本
        resolutionEditBtn.textContent = t('btnEdit');
        isEditingResolution = false;
        
        // 禁用输入框
        maxResolutionInput.setAttribute('readonly', true);
        
        console.log('最大分辨率已保存:', resolution);
      } catch (error) {
        console.error('保存分辨率设置失败:', error);
        alert(t('saveFailed'));
      }
    } else {
      // 进入编辑模式
      resolutionEditBtn.textContent = t('btnSave');
      isEditingResolution = true;
      
      // 启用输入框
      maxResolutionInput.removeAttribute('readonly');
      maxResolutionInput.focus();
      maxResolutionInput.select();
    }
  });

  // 确保输入框只接受整数
  maxResolutionInput.addEventListener('input', function() {
    let value = this.value;
    // 移除非数字字符
    value = value.replace(/[^\d]/g, '');
    this.value = value;
  });

  // 在输入框失去焦点时验证最小值
  maxResolutionInput.addEventListener('blur', function() {
    if (!isEditingResolution) return;
    
    let value = parseInt(this.value);
    if (isNaN(value) || value < 200) {
      this.value = 200;
    }
  });

  // 初始化设置
  loadSettings();
});
