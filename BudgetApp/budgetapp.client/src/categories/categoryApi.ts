import { apiGet, apiPost, apiPut } from '../api/apiClient'

export type CategoryType = 'Expense' | 'Income' | 'Transfer'

export interface CategoryItem {
  id: string
  name: string
  type: CategoryType
  displayOrder: number
  isActive: boolean
  children: CategoryItem[]
}

export function getCategories(householdId: string): Promise<CategoryItem[]> {
  return apiGet<CategoryItem[]>(`/api/households/${householdId}/categories`)
}

export function createCategory(
  householdId: string,
  request: { name: string, type?: CategoryType, parentCategoryId?: string },
): Promise<{ id: string }> {
  return apiPost(`/api/households/${householdId}/categories`, request)
}

export function updateCategory(
  householdId: string,
  categoryId: string,
  name: string,
): Promise<void> {
  return apiPut(`/api/households/${householdId}/categories/${categoryId}`, { name })
}

export function reorderCategories(
  householdId: string,
  categoryIds: string[],
): Promise<void> {
  return apiPut(`/api/households/${householdId}/categories/order`, { categoryIds })
}

export function setCategoryActive(
  householdId: string,
  categoryId: string,
  isActive: boolean,
): Promise<void> {
  const action = isActive ? 'reactivate' : 'deactivate'
  return apiPost(
    `/api/households/${householdId}/categories/${categoryId}/${action}`,
    {},
  )
}
