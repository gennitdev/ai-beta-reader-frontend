<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useDatabase } from '@/composables/useDatabase'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/vue/24/outline'

interface CustomReviewerProfile {
  id: number
  name: string
  description: string
  created_at: string
  updated_at: string
}

const {
  getCustomProfiles,
  createCustomProfile,
  updateCustomProfile,
  deleteCustomProfile
} = useDatabase()

const profiles = ref<CustomReviewerProfile[]>([])
const isLoading = ref(false)
const error = ref('')
const showCreateForm = ref(false)
const editingProfile = ref<CustomReviewerProfile | null>(null)

const formData = ref({
  name: '',
  description: ''
})

const fetchProfiles = async () => {
  try {
    isLoading.value = true
    error.value = ''
    const profilesData = await getCustomProfiles()
    profiles.value = profilesData
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load profiles'
  } finally {
    isLoading.value = false
  }
}

const handleCreateProfile = async () => {
  try {
    error.value = ''
    await createCustomProfile({
      name: formData.value.name,
      description: formData.value.description
    })
    await fetchProfiles()
    resetForm()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create profile'
  }
}

const handleUpdateProfile = async () => {
  if (!editingProfile.value) return

  try {
    error.value = ''
    await updateCustomProfile(editingProfile.value.id, {
      name: formData.value.name,
      description: formData.value.description
    })
    await fetchProfiles()
    resetForm()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update profile'
  }
}

const deleteProfile = async (id: number) => {
  if (!confirm('Are you sure you want to delete this profile? This will also delete all reviews using this profile.')) {
    return
  }

  try {
    error.value = ''
    await deleteCustomProfile(id)
    await fetchProfiles()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete profile'
  }
}

const startEdit = (profile: CustomReviewerProfile) => {
  editingProfile.value = profile
  formData.value = {
    name: profile.name,
    description: profile.description
  }
  showCreateForm.value = true
}

const resetForm = () => {
  formData.value = { name: '', description: '' }
  editingProfile.value = null
  showCreateForm.value = false
  error.value = ''
}

const handleSubmit = async () => {
  if (!formData.value.name.trim() || !formData.value.description.trim()) {
    error.value = 'Please fill in all fields'
    return
  }

  if (editingProfile.value) {
    await handleUpdateProfile()
  } else {
    await handleCreateProfile()
  }
}

onMounted(() => {
  fetchProfiles()
})
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Custom Reviewer Profiles</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Create custom AI reviewer profiles with your own descriptions and personalities.
          </p>
        </div>
        <button
          @click="showCreateForm = true"
          class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <PlusIcon class="w-5 h-5 mr-2" />
          Add Profile
        </button>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="px-6 py-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
      <p class="text-red-600 dark:text-red-400">{{ error }}</p>
    </div>

    <!-- Create/Edit Form -->
    <div v-if="showCreateForm" class="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label for="profile-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Profile Name
          </label>
          <input
            id="profile-name"
            v-model="formData.name"
            type="text"
            placeholder="e.g., Encouraging Beta Reader"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
        <div>
          <label for="profile-description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Description & Personality
          </label>
          <textarea
            id="profile-description"
            v-model="formData.description"
            rows="4"
            placeholder="Describe how this reviewer should provide feedback. Include tone, style, focus areas, etc."
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
            required
          ></textarea>
        </div>
        <div class="flex items-center space-x-3">
          <button
            type="submit"
            class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {{ editingProfile ? 'Update Profile' : 'Create Profile' }}
          </button>
          <button
            type="button"
            @click="resetForm"
            class="inline-flex items-center px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>

    <!-- Profiles List -->
    <div class="px-6 py-4">
      <div v-if="isLoading" class="text-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p class="text-gray-600 dark:text-gray-400 mt-2">Loading profiles...</p>
      </div>

      <div v-else-if="profiles.length === 0" class="text-center py-8">
        <p class="text-gray-600 dark:text-gray-400">No custom reviewer profiles yet.</p>
        <p class="text-sm text-gray-500 dark:text-gray-500 mt-1">
          Create your first profile to get started!
        </p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="profile in profiles"
          :key="profile.id"
          class="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 dark:text-white">{{ profile.name }}</h3>
              <p class="text-gray-600 dark:text-gray-400 mt-1">{{ profile.description }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">
                Created {{ new Date(profile.created_at).toLocaleDateString() }}
              </p>
            </div>
            <div class="flex items-center space-x-2 ml-4">
              <button
                @click="startEdit(profile)"
                class="inline-flex items-center p-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="Edit profile"
              >
                <PencilIcon class="w-5 h-5" />
              </button>
              <button
                @click="deleteProfile(profile.id)"
                class="inline-flex items-center p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Delete profile"
              >
                <TrashIcon class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
