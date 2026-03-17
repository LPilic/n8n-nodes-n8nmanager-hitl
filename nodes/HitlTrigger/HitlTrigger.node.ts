import {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	INodePropertyOptions,
	IPollFunctions,
	ILoadOptionsFunctions,
	NodeOperationError,
} from 'n8n-workflow';

export class HitlTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'HITL Trigger',
		name: 'hitlTrigger',
		icon: 'fa:user-check',
		group: ['trigger'],
		version: 1,
		subtitle: '=HITL Decision',
		description: 'Triggers when a HITL approval decision is made',
		defaults: {
			name: 'HITL Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'hitlApi',
				required: true,
			},
		],
		polling: true,
		properties: [
			{
				displayName: 'Template Filter',
				name: 'templateSlug',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTemplates',
				},
				default: '__all__',
				description: 'Only trigger for a specific template, or all',
			},
			{
				displayName: 'Action Filter',
				name: 'actionFilter',
				type: 'options',
				options: [
					{ name: 'All', value: 'all' },
					{ name: 'Approved', value: 'approve' },
					{ name: 'Rejected', value: 'reject' },
				],
				default: 'all',
				description: 'Only trigger for specific actions',
			},
		],
	};

	methods = {
		loadOptions: {
			async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('hitlApi');
				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'hitlApi', {
					method: 'GET',
					url: `${credentials.instanceUrl}/api/hitl/templates`,
					json: true,
				});

				const templates = Array.isArray(response) ? response : response.templates || [];
				const options: INodePropertyOptions[] = [
					{ name: 'All Templates', value: '__all__' },
				];
				for (const t of templates as Array<{ slug: string; name: string }>) {
					options.push({ name: t.name, value: t.slug });
				}
				return options;
			},
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const credentials = await this.getCredentials('hitlApi');
		const templateSlug = this.getNodeParameter('templateSlug', '__all__') as string;
		const actionFilter = this.getNodeParameter('actionFilter', 'all') as string;

		const staticData = this.getWorkflowStaticData('node') as IDataObject;
		const lastPoll = staticData.lastPoll as string | undefined;
		const now = new Date().toISOString();

		// Build query params
		const params = new URLSearchParams();
		params.append('status', 'approved,rejected');
		if (lastPoll) params.append('since', lastPoll);
		if (templateSlug !== '__all__') params.append('template', templateSlug);

		let requests: Array<IDataObject>;
		try {
			const response = await this.helpers.httpRequestWithAuthentication.call(this, 'hitlApi', {
				method: 'GET',
				url: `${credentials.instanceUrl}/api/hitl/requests?${params.toString()}`,
				json: true,
			});
			requests = Array.isArray(response) ? response : response.requests || [];
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			throw new NodeOperationError(this.getNode(), `HITL poll failed: ${message}`);
		}

		// Update last poll timestamp
		staticData.lastPoll = now;

		// Apply action filter
		if (actionFilter !== 'all') {
			requests = requests.filter((r) => r.action === actionFilter);
		}

		if (requests.length === 0) {
			return null;
		}

		return [this.helpers.returnJsonArray(requests)];
	}
}
