const FormFiller = {
  // Maps common field name patterns to profile keys
  fieldMap: {
    // Personal
    'first.?name|fname': 'firstName',
    'last.?name|lname|surname': 'lastName',
    'full.?name|your.?name': 'fullName',
    'email|e-mail': 'email',
    'phone|mobile|cell': 'phone',
    'address|street': 'address',
    'city': 'city',
    'state|province': 'state',
    'zip|postal': 'zip',
    'country': 'country',
    // Links
    'linkedin': 'linkedin',
    'github': 'github',
    'portfolio|website|personal.?site': 'website',
    // Professional
    'title|position|role|job.?title': 'currentTitle',
    'company|employer|current.?company': 'currentCompany',
    'experience|years': 'yearsExperience',
    'salary|compensation|expected': 'expectedSalary',
  },

  nativeInputSet(el, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  },

  getProfileKey(field) {
    const label = (field.name || field.id || field.placeholder || field.getAttribute('aria-label') || '').toLowerCase();
    for (const [pattern, key] of Object.entries(this.fieldMap)) {
      if (new RegExp(pattern, 'i').test(label)) return key;
    }
    return null;
  },

  fillForm(profile) {
    const inputs = document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=file]), textarea, select');
    let filled = 0;

    inputs.forEach(input => {
      const key = this.getProfileKey(input);
      if (!key || !profile[key]) return;

      if (input.tagName === 'SELECT') {
        const option = Array.from(input.options).find(o =>
          o.text.toLowerCase().includes(profile[key].toLowerCase())
        );
        if (option) { input.value = option.value; input.dispatchEvent(new Event('change', { bubbles: true })); filled++; }
      } else {
        this.nativeInputSet(input, profile[key]);
        filled++;
      }
    });

    return filled;
  },

  injectValue(el, value) {
    this.nativeInputSet(el, value);
  }
};
