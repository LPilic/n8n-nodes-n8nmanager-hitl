import {
	IExecuteFunctions,
	IWebhookFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	NodeOperationError,
} from 'n8n-workflow';

export class HitlApproval implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'HITL Approval',
		name: 'hitlApproval',
		icon: 'fa:user-check',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["templateSlug"]}}',
		description: 'Send data for human review and wait for approval/rejection',
		usableAsTool: true,
		defaults: {
			name: 'HITL Approval',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'hitlApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: '',
				restartWebhook: true,
			},
		],
		properties: [
			{
				displayName: 'Template',
				name: 'templateSlug',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTemplates',
				},
				default: '',
				required: true,
				description: 'HITL template to use for the approval form',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'Request title shown to the reviewer (defaults to template name if empty)',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Context for the reviewer',
			},
			{
				displayName: 'Priority',
				name: 'priority',
				type: 'options',
				options: [
					{ name: 'Low', value: 'low' },
					{ name: 'Medium', value: 'medium' },
					{ name: 'High', value: 'high' },
					{ name: 'Critical', value: 'critical' },
				],
				default: 'medium',
			},
			{
				displayName: 'Timeout (Minutes)',
				name: 'timeoutMinutes',
				type: 'number',
				default: 1440,
				description: 'Minutes before the request auto-expires (default: 24 hours)',
			},
			{
				displayName: 'Data',
				name: 'data',
				type: 'json',
				default: '={}',
				required: true,
				description: 'JSON data to display in the approval form. Use an expression to map input fields.',
			},
			{
				displayName: 'Assign To',
				name: 'assignTo',
				type: 'string',
				default: '',
				description: 'User ID to assign the review to (optional)',
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
				return templates.map((t: { slug: string; name: string; description?: string }) => ({
					name: t.name,
					value: t.slug,
					description: t.description || '',
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials = await this.getCredentials('hitlApi');

		const templateSlug = this.getNodeParameter('templateSlug', 0) as string;
		const title = this.getNodeParameter('title', 0, '') as string;
		const description = this.getNodeParameter('description', 0, '') as string;
		const priority = this.getNodeParameter('priority', 0, 'medium') as string;
		const timeoutMinutes = this.getNodeParameter('timeoutMinutes', 0, 1440) as number;
		const dataParam = this.getNodeParameter('data', 0, '{}') as string;
		const assignTo = this.getNodeParameter('assignTo', 0, '') as string;

		let data: object;
		try {
			data = typeof dataParam === 'string' ? JSON.parse(dataParam) : dataParam;
		} catch {
			throw new NodeOperationError(this.getNode(), 'Invalid JSON in Data field');
		}

		// Build the n8n webhook-waiting resume URL for this execution
		const baseUrl = this.getInstanceBaseUrl();
		const executionId = this.getExecutionId();
		const callbackUrl = `${baseUrl}webhook-waiting/${executionId}`;

		const body: Record<string, unknown> = {
			callback_url: callbackUrl,
			title: title || undefined,
			description: description || undefined,
			priority,
			timeout_minutes: timeoutMinutes,
			data,
		};
		if (assignTo) body.assign_to = assignTo;

		let response: { id?: number; error?: string };
		try {
			response = await this.helpers.httpRequestWithAuthentication.call(this, 'hitlApi', {
				method: 'POST',
				url: `${credentials.instanceUrl}/api/hitl/webhook/${templateSlug}`,
				body,
				json: true,
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes('404')) {
				throw new NodeOperationError(
					this.getNode(),
					`Template "${templateSlug}" not found. Check that it exists and is active in n8n-library.`,
				);
			}
			throw new NodeOperationError(this.getNode(), `HITL request failed: ${message}`);
		}

		if (response.error) {
			throw new NodeOperationError(this.getNode(), `HITL request rejected: ${response.error}`);
		}

		// Put the execution into a waiting state until the callback arrives
		const waitTill = new Date(Date.now() + timeoutMinutes * 60 * 1000);
		await this.putExecutionToWait(waitTill);

		return [items];
	}

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;

		const output: IDataObject = {
			request_id: body.request_id,
			action: body.action,
			status: body.status,
			responded_by: body.responded_by,
			form_data: body.form_data || {},
			comment: body.comment || '',
			timestamp: body.timestamp || new Date().toISOString(),
		};

		return {
			workflowData: [this.helpers.returnJsonArray(output)],
		};
	}
}
