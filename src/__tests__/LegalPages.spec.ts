// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PrivacyPolicyView from '@/views/PrivacyPolicyView.vue'
import TermsOfUseView from '@/views/TermsOfUseView.vue'

const global = {
  stubs: {
    RouterLink: {
      props: ['to'],
      template: '<a :href="to"><slot /></a>',
    },
  },
}

describe('public legal pages', () => {
  it('explains local storage, third-party AI use, and narrow Google Drive access', () => {
    const wrapper = mount(PrivacyPolicyView, { global })

    expect(wrapper.text()).toContain('Privacy Policy')
    expect(wrapper.text()).toContain('local-first writing application')
    expect(wrapper.text()).toContain('https://www.googleapis.com/auth/drive.file')
    expect(wrapper.text()).toContain('ai-beta-reader-backup.enc')
    expect(wrapper.text()).toContain('encrypted on your device before upload')
    expect(wrapper.text()).toContain('Google API Services User Data Policy')
    expect(wrapper.text()).toContain('Limited Use requirements')
    expect(wrapper.text()).toContain('does not sell Google user data')
    expect(wrapper.get('a[href="mailto:gennitdev@gmail.com"]')).toBeTruthy()
  })

  it('sets expectations for ownership, third-party services, backups, and AI output', () => {
    const wrapper = mount(TermsOfUseView, { global })

    expect(wrapper.text()).toContain('Terms of Use')
    expect(wrapper.text()).toContain('You retain ownership')
    expect(wrapper.text()).toContain('Third-party services')
    expect(wrapper.text()).toContain('Backups and data loss')
    expect(wrapper.text()).toContain('AI output')
    expect(wrapper.get('a[href="/privacy"]')).toBeTruthy()
  })
})
