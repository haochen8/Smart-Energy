# Terraform (OpenStack Cumulus) – 2dv013-Smart-energy

Use this folder to provision the Smart Energy lab environment on Cumulus/OpenStack.

Prereqs
- OpenStack auth available via `clouds.yaml` or exported `OS_` env vars.
- Keypair already created in Horizon; update `key_pair_name` and `identity_file` in `terraform.tfvars`.
- Confirm external network name (`public` vs `campus`) and an allowed flavor. Update TODOs if needed.

Quickstart
```bash
cd terraform
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Outputs you need for Ansible
- `floating_ip` for the control-plane node (public entry point).
- `cp_private_ips` and `worker_private_ips` for internal addressing.
- `ssh_command` shows how to reach the cluster with the chosen key/user.

Notes
- Resource names are prefixed with `smart-energy` by default; change `base_name` to avoid collisions.
- Set either `flavor_name` or `flavor_id` (use `openstack flavor list` in the Smart Energy project to confirm an existing option).
- Increase `flavor_name` / node counts only after checking project quotas.
- When something is unclear (external network, flavor availability), update the `# TODO` markers instead of guessing.
